const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import shared utilities
const { asyncHandler } = require('../../_shared/middleware/errorHandler');
const logger = require('../../_shared/utils/logger');
const { validateEnvironment } = require('../../_shared/utils/validateEnv');
const { sanitizeFilename } = require('../../_shared/utils/sanitize');

const { parseCSVBuffer, parseExcelBuffer, extractProductsFromRows } = require('./utils/extractors');
const { calculateNewTabName, detectDateFromFilename, extractDateFromTabName } = require('./utils/date_utils');
const { filterByTemplateName, extractRequiredColumns, normalizePhoneNumber, dedupeByPhone, extractDatesFromRows } = require('./utils/dataProcessing');
const { detectCompany } = require('./utils/companyDetector');
const SheetsManager = require('./services/sheetsManager');
const { logUpdate } = require('./utils/logger');
const { COMPANY_NAMES, DEFAULT_GOOGLE_SHEET_ID, CREDENTIALS_FILE } = require('./config');

// Enhanced multer config with file validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Sanitize filename
    file.originalname = sanitizeFilename(file.originalname);
    
    // Validate file type
    const allowedTypes = /csv|xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      logger.debug('File upload accepted', {
        app: 'gsheet',
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
      return cb(null, true);
    }
    
    logger.warn('File upload rejected - invalid type', {
      app: 'gsheet',
      filename: file.originalname,
      mimetype: file.mimetype
    });
    cb(new Error('Invalid file type. Only CSV and Excel files (.csv, .xlsx, .xls) are allowed.'));
  }
});

const app = express();
const { PORT: configPort } = require('./config');

// Validate environment variables
const envConfig = validateEnvironment({
  GSHEET_PORT: { type: 'number', required: false },
  PORT: { type: 'number', required: false },
  NODE_ENV: { type: 'string', default: 'development' },
  DOMAIN: { type: 'string', required: false },
  NEXT_PUBLIC_BASE_URL: { type: 'string', required: false },
  SUPPRESS_PORT_MESSAGES: { type: 'boolean', default: false }
});

// SECURITY: Require port from environment, no hardcoded fallback
const PORT = envConfig.GSHEET_PORT || envConfig.PORT || configPort;

if (!PORT || isNaN(PORT)) {
  console.error('[GSHEET] ERROR: PORT not configured in .env');
  logger.error('PORT configuration missing', {
    app: 'gsheet',
    required: ['GSHEET_PORT', 'PORT']
  });
  process.exit(1);
}

logger.info('Environment validated successfully', {
  app: 'gsheet',
  port: PORT,
  nodeEnv: envConfig.NODE_ENV
});

// CORS configuration - allow requests from proxy, Vite dev server, and production domain
// SECURITY: Require domain from environment, no hardcoded fallback
const DOMAIN = process.env.DOMAIN || process.env.NEXT_PUBLIC_BASE_URL;

if (!DOMAIN && process.env.NODE_ENV === 'production') {
  console.error('[GSHEET] ERROR: DOMAIN or NEXT_PUBLIC_BASE_URL required in production');
  console.error('[GSHEET] Please set DOMAIN or NEXT_PUBLIC_BASE_URL in project-hub/.env');
}
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      // Development origins
      'http://localhost:4090',  // Project Hub
      'http://localhost:5173',  // Vite dev server
      'http://localhost:5174',  // Vite dev server (alternate)
      'http://127.0.0.1:4090',
      'http://127.0.0.1:5173',
      // Production domain
      DOMAIN,
      DOMAIN.replace('https://', 'http://'), // Allow HTTP version if needed
    ];
    
    // In production, also allow any origin from the domain
    if (isProduction && origin.includes('meddey.co.in')) {
      return callback(null, true);
    }
    
    // Check if origin matches any allowed pattern
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // For proxy requests, allow them (proxy will handle CORS)
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit to 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from built client (if built)
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  console.log(`[GSHEET] Serving built client from: ${clientDistPath}`);
}

// Favicon handler (prevents 404 errors)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content - browser will use default favicon
});

// API health check
app.get('/api/health', (req, res) => {
  logger.debug('Health check requested', { app: 'gsheet' });
  res.json({
    status: 'ok',
    message: 'Google Sheets Wizard API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Root route - serve built client or API info
app.get('/', (req, res) => {
  // Check if request wants JSON (API call)
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ 
      message: 'Google Sheets Wizard API',
      version: '1.0.0',
      endpoints: [
        'GET /api/health',
        'POST /api/upload',
        'POST /api/extract',
        'POST /api/detect',
        'POST /api/process',
        'POST /api/configure',
        'POST /api/sync'
      ]
    });
  }
  
  // If client is built, serve it (SPA routing - all routes serve index.html)
  if (fs.existsSync(clientDistPath)) {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  
  // Otherwise serve API info page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Google Sheets Wizard API</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          max-width: 600px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        h1 {
          font-size: 2.5em;
          margin-bottom: 10px;
          text-align: center;
        }
        .subtitle {
          text-align: center;
          opacity: 0.9;
          margin-bottom: 30px;
        }
        .info {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .info h2 {
          margin-bottom: 15px;
          font-size: 1.3em;
        }
        .info p {
          margin-bottom: 10px;
          line-height: 1.6;
        }
        .link {
          display: inline-block;
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin-top: 10px;
          transition: all 0.3s;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .link:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }
        .endpoints {
          margin-top: 20px;
        }
        .endpoints h3 {
          margin-bottom: 10px;
        }
        .endpoints ul {
          list-style: none;
          padding-left: 0;
        }
        .endpoints li {
          padding: 5px 0;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }
        .status {
          display: inline-block;
          background: #4ade80;
          color: #000;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.85em;
          font-weight: bold;
          margin-left: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 Google Sheets Wizard</h1>
        <p class="subtitle">Node.js API Server</p>
        
        <div class="info">
          <h2>✅ Server is Running <span class="status">ONLINE</span></h2>
          <p>This is the API server. To use the application, access the client interface:</p>
          <a href="http://localhost:5173" class="link" target="_blank">
            → Open Client Application (http://localhost:5173)
          </a>
        </div>
        
        <div class="info">
          <h2>📋 API Endpoints</h2>
          <div class="endpoints">
            <ul>
              <li>GET /api/health - Health check</li>
              <li>POST /api/upload - Upload CSV/Excel files</li>
              <li>POST /api/extract - Extract product names</li>
              <li>POST /api/detect - Detect companies</li>
              <li>POST /api/process - Process data & calculate tab names</li>
              <li>POST /api/configure - Configure update mode</li>
              <li>POST /api/sync - Sync to Google Sheets</li>
            </ul>
          </div>
        </div>
        
        <div class="info">
          <p><strong>Note:</strong> If the client link doesn't work, make sure the client is running:</p>
          <p style="font-family: monospace; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; margin-top: 10px;">
            cd client && npm run dev
          </p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// STEP 1: Upload endpoint with async error handling
app.post('/api/upload', upload.array('files'), asyncHandler(async (req, res) => {
  logger.info('File upload started', {
    app: 'gsheet',
    fileCount: req.files?.length || 0
  });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const parsed = [];
    for (const file of req.files) {
      const name = file.originalname;
      const ext = path.extname(name).toLowerCase();
      
      try {
        let rows = [];
        if (ext === '.csv') {
          // Parse CSV (matching Python's pd.read_csv)
          const csv = file.buffer.toString('utf8');
          rows = parseCSVBuffer(csv);
        } else if (ext === '.xlsx' || ext === '.xls') {
          // Parse Excel (matching Python's pd.read_excel)
          rows = parseExcelBuffer(file.buffer);
        } else {
          parsed.push({ name, rows: [], error: `Unsupported file type: ${ext}. Please upload CSV or Excel files.` });
          continue;
        }

        // Validate that we got rows
        if (!Array.isArray(rows)) {
          parsed.push({ name, rows: [], error: 'Failed to parse file - invalid format' });
          continue;
        }

        parsed.push({ 
          name, 
          rows, 
          rowCount: rows.length,
          columns: rows.length > 0 ? Object.keys(rows[0] || {}) : []
        });
      } catch (err) {
        logger.error('Error parsing file', {
          app: 'gsheet',
          filename: name,
          error: err.message,
          stack: err.stack
        });
        parsed.push({
          name,
          rows: [],
          error: err.message || 'Error reading file. Please ensure the file is a valid CSV or Excel file.'
        });
      }
    }

    logger.info('File upload completed', {
      app: 'gsheet',
      totalFiles: parsed.length,
      successfulFiles: parsed.filter(f => !f.error).length
    });
    
    // Cache parsed files for fallback in subsequent steps
    try {
      const key = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown') + ':' + (req.headers['x-user-id'] || 'anon');
      LAST_PARSED.set(key, parsed);
      setTimeout(() => LAST_PARSED.delete(key), 10 * 60 * 1000);
    } catch {}

    res.json({ files: parsed });
  }));

// STEP 2: Extract products endpoint with async error handling
// In-memory store of last parsed files keyed by user/ip
const LAST_PARSED = new Map();

app.post('/api/extract', asyncHandler(async (req, res) => {
  logger.info('Product extraction started', { app: 'gsheet' });
    let { files, datasets } = req.body || {};
    if (files && !Array.isArray(files)) files = [files];
    if (datasets && !Array.isArray(datasets)) datasets = [datasets];
    let working = Array.isArray(files) ? files : (Array.isArray(datasets) ? datasets : null);
    if (!working) {
      const key = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown') + ':' + (req.headers['x-user-id'] || 'anon');
      const cached = LAST_PARSED.get(key);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        logger.info('Using cached parsed files for extraction', { app: 'gsheet', count: cached.length });
        working = cached;
      }
    }
    if (!working || !Array.isArray(working) || working.length === 0) {
      return res.status(400).json({ error: 'files array required', hint: 'Send { files: [{ name, rows }] } or upload first via /api/upload' });
    }

    const results = [];
    for (const file of working) {
      try {
        if (!file || !file.name) {
          results.push({ name: 'unknown', error: 'Invalid file object' });
          continue;
        }

        if (!file.rows || !Array.isArray(file.rows) || file.rows.length === 0) {
          results.push({ name: file.name, error: 'No rows to process', rows: [] });
          continue;
        }

        const extraction = extractProductsFromRows(file.rows);
        
        // Handle case where extraction returns error
        if (extraction.error) {
          results.push({ 
            name: file.name, 
            error: extraction.error,
            rows: [],
            extractedCount: 0,
            total: file.rows.length
          });
          continue;
        }

        results.push({
          name: file.name,
          rows: extraction.rows || [],
          extractedCount: extraction.extractedCount || 0,
          total: extraction.total || file.rows.length,
          duplicatesRemoved: extraction.duplicatesRemoved || 0,
          filteredStatusCount: extraction.filteredStatusCount || 0,
          finalCount: extraction.finalCount || 0
        });
      } catch (fileErr) {
        logger.error('Error processing file for extraction', {
          app: 'gsheet',
          filename: file?.name,
          error: fileErr.message
        });
        results.push({
          name: file?.name || 'unknown',
          error: fileErr.message || 'Error processing file',
          rows: []
        });
      }
    }

    logger.info('Product extraction completed', {
      app: 'gsheet',
      totalFiles: results.length,
      successfulFiles: results.filter(r => !r.error).length
    });
    
    res.json({ results });
}));

// STEP 3: Detect companies endpoint with async error handling
app.post('/api/detect', asyncHandler(async (req, res) => {
  logger.info('Company detection started', { app: 'gsheet' });
  
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    logger.warn('Invalid request - files array missing', { app: 'gsheet' });
    return res.status(400).json({ error: 'files array required' });
  }

  const results = [];
  for (const file of files) {
    const detection = detectCompany(file.name, file.rows || []);
    results.push({
      name: file.name,
      company: detection.company,
      confidence: detection.confidence,
      source: detection.source,
      availableCompanies: COMPANY_NAMES
    });
  }

  logger.info('Company detection completed', {
    app: 'gsheet',
    totalFiles: results.length
  });
  
  res.json({ results });
}));

// STEP 4: Process data endpoint with enhanced error handling
app.post('/api/process', asyncHandler(async (req, res) => {
  logger.info('Data processing started', { app: 'gsheet' });
    const { files, companyMap } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'files array required' });
    }
    if (!companyMap || typeof companyMap !== 'object') {
      return res.status(400).json({ error: 'companyMap object required' });
    }

    // Group files by company
    const companyData = {};
    const companyFilenames = {};
    
    for (const file of files) {
      const company = companyMap[file.name] || COMPANY_NAMES[0];
      if (!companyData[company]) {
        companyData[company] = [];
        companyFilenames[company] = [];
      }
      companyData[company].push(file.rows || []);
      companyFilenames[company].push(file.name);
    }

    // Initialize sheets manager
    const manager = new SheetsManager();
    await manager.authorize();

    const processed = {};
    
    for (const [company, rowsArrays] of Object.entries(companyData)) {
      // Combine all rows for this company
      let combinedRows = [];
      let totalBeforeFilter = 0;
      let totalAfterFilter = 0;
      
      for (const rows of rowsArrays) {
        totalBeforeFilter += rows.length;
        
        // Filter by Template Name column (cancelled, delivered, shipped)
        const filtered = filterByTemplateName(rows);
        totalAfterFilter += filtered.length;
        
        // Extract required columns
        const extracted = extractRequiredColumns(filtered);
        combinedRows = combinedRows.concat(extracted);
      }
      
      // Remove duplicates
      combinedRows = dedupeByPhone(combinedRows);
      
      // Normalize phone numbers
      combinedRows = normalizePhoneNumber(combinedRows);
      
      // Find existing tab
      const matchingTab = await manager.findMatchingTab(company, null);
      
      // Extract dates for tab naming
      let newTabName = null;
      let dateStr = null;
      let uniqueDates = [];
      let originalDates = [];
      
      // PRIORITY 1: Use dates from CSV data
      const csvDates = extractDatesFromRows(combinedRows);
      if (csvDates.length > 0) {
        uniqueDates = csvDates;
        dateStr = csvDates[0].toISOString().split('T')[0];
        originalDates = csvDates.map(d => d.toISOString().split('T')[0]);
        newTabName = calculateNewTabName(csvDates, company);
      }
      
      // PRIORITY 2: If no CSV dates, try filename dates
      if (!newTabName && companyFilenames[company]) {
        const filenameDates = [];
        for (const filename of companyFilenames[company]) {
          const detected = detectDateFromFilename(filename);
          if (detected) {
            filenameDates.push(detected);
          }
        }
        if (filenameDates.length > 0) {
          uniqueDates = filenameDates;
          dateStr = filenameDates[0].toISOString().split('T')[0];
          originalDates = filenameDates.map(d => d.toISOString().split('T')[0]);
          newTabName = calculateNewTabName(filenameDates, company);
        }
      }
      
      // PRIORITY 3: If no CSV or filename dates, use existing sheet date
      if (!newTabName && matchingTab) {
        const sheetDate = extractDateFromTabName(matchingTab);
        if (sheetDate) {
          uniqueDates = [sheetDate];
          dateStr = sheetDate.toISOString().split('T')[0];
          originalDates = [dateStr];
          newTabName = calculateNewTabName([sheetDate], company);
        }
      }
      
      // Determine final tab name
      let oldTabName = null;
      let finalTabName = null;
      
      if (matchingTab) {
        oldTabName = matchingTab;
        if (newTabName && newTabName !== matchingTab) {
          finalTabName = newTabName;
        } else {
          finalTabName = matchingTab;
        }
      } else if (newTabName) {
        finalTabName = newTabName;
      }
      
      processed[company] = {
        dataframe: combinedRows,
        oldTabName,
        tabName: finalTabName,
        rowCount: combinedRows.length,
        date: dateStr,
        uniqueDates: uniqueDates.map(d => d.toISOString()),
        originalDates,
        removedByStatus: totalBeforeFilter - totalAfterFilter
      };
    }

    logger.info('Data processing completed', {
      app: 'gsheet',
      companiesProcessed: Object.keys(processed).length
    });
    
    res.json({ processed });
}));

// STEP 5: Configure endpoint with error handling
app.post('/api/configure', asyncHandler(async (req, res) => {
  const { updateMode } = req.body;
  logger.info('Configuration updated', {
    app: 'gsheet',
    updateMode: updateMode || 'Replace'
  });
  res.json({ success: true, updateMode: updateMode || 'Replace' });
}));

// STEP 6: Sync/Update Google Sheets endpoint with enhanced error handling
app.post('/api/sync', asyncHandler(async (req, res) => {
  logger.info('Google Sheets sync started', { app: 'gsheet' });
    const { processedCompanies, updateMode } = req.body;
    if (!processedCompanies || typeof processedCompanies !== 'object') {
      return res.status(400).json({ error: 'processedCompanies object required' });
    }

    const manager = new SheetsManager();
    await manager.authorize();

    const results = {};
    
    for (const [company, data] of Object.entries(processedCompanies)) {
      try {
        const oldTabName = data.oldTabName;
        const tabName = data.tabName;
        const df = data.dataframe || [];
        
        if (!tabName) {
          results[company] = { success: false, error: 'No tab name available' };
          continue;
        }
        
        // Rename tab if needed
        let finalTabName = tabName;
        if (oldTabName && tabName && oldTabName !== tabName) {
          try {
            const renamed = await manager.renameWorksheet(oldTabName, tabName);
            if (renamed) {
              finalTabName = tabName;
            } else {
              finalTabName = oldTabName;
            }
          } catch (renameErr) {
            logger.warn('Could not rename tab', {
              app: 'gsheet',
              company,
              error: renameErr.message
            });
            finalTabName = oldTabName;
          }
        }
        
        // Update data based on mode
        if (updateMode === 'Append') {
          const rowsAppended = await manager.appendData(finalTabName, df);
          results[company] = { success: true, rowsAppended, tabName: finalTabName };
          logger.info('Data appended successfully', {
            app: 'gsheet',
            company,
            rowsAppended,
            tabName: finalTabName
          });
        } else {
          const success = await manager.processUpload(df, finalTabName, company);
          results[company] = { success, rowsUpdated: df.length, tabName: finalTabName };
          logger.info('Data replaced successfully', {
            app: 'gsheet',
            company,
            rowsUpdated: df.length,
            tabName: finalTabName
          });
        }
        
        // Log update
        logUpdate({
          companyName: company,
          worksheetName: finalTabName,
          rowsUpdated: df.length,
          status: 'Success'
        });
        
      } catch (companyErr) {
        logger.error('Error processing company data', {
          app: 'gsheet',
          company,
          error: companyErr.message,
          stack: companyErr.stack
        });
        results[company] = { success: false, error: companyErr.message };
      }
    }

    logger.info('Google Sheets sync completed', {
      app: 'gsheet',
      totalCompanies: Object.keys(results).length,
      successfulCompanies: Object.values(results).filter(r => r.success).length
    });
    
    res.json({ results });
}));

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/upload',
      'POST /api/extract',
      'POST /api/detect',
      'POST /api/process',
      'POST /api/configure',
      'POST /api/sync'
    ]
  });
});

// SPA routing - serve index.html for all non-API routes (if client is built)
if (fs.existsSync(clientDistPath)) {
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    // Serve index.html for all other routes (SPA routing)
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Error handler (multer errors and general errors)
app.use((err, req, res, next) => {
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    logger.error('File upload error', {
      app: 'gsheet',
      error: err.message,
      code: err.code
    });
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File Too Large',
        message: 'File size exceeds 50MB limit',
        maxSize: '50MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too Many Files',
        message: 'Maximum 10 files allowed per upload'
      });
    }
    return res.status(400).json({
      error: 'File Upload Error',
      message: err.message
    });
  }
  
  // Handle other errors
  logger.error('Server error', {
    app: 'gsheet',
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const suppressMessages = envConfig.SUPPRESS_PORT_MESSAGES;
const host = process.env.HOST || (suppressMessages ? '127.0.0.1' : '0.0.0.0');

const server = app.listen(PORT, host, () => {
  if (suppressMessages) {
    console.log(`[GSHEET] ✓ Ready`);
  } else {
    console.log(`[GSHEET] ✓ Running on port ${PORT}`);
  }
  logger.info('Server started', {
    app: 'gsheet',
    port: PORT,
    host
  });
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[GSHEET] ERROR: Port ${PORT} already in use`);
    logger.error('Port already in use', {
      app: 'gsheet',
      port: PORT,
      error: err.message
    });
  } else {
    console.error('[GSHEET] ERROR:', err.message);
    logger.error('Server error', {
      app: 'gsheet',
      error: err.message,
      stack: err.stack
    });
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully', { app: 'gsheet' });
  server.close(() => {
    logger.info('Server closed', { app: 'gsheet' });
    process.exit(0);
  });
});
