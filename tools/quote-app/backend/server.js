const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const connectDB = require('./config/db');

// Load environment variables from project-hub root FIRST
const envPath = path.join(__dirname, '..', '..', '..', '.env');
const suppressLogs = process.env.SUPPRESS_PORT_MESSAGES === 'true' || process.env.LOG_LEVEL === 'ERROR';
if (!suppressLogs) {
  console.log('Looking for .env file at:', envPath);
  console.log('.env file exists:', fs.existsSync(envPath));
}
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
process.env.QUOTE_APP_DISABLE_MONGO = process.env.QUOTE_APP_DISABLE_MONGO ?? 'false';
if (!process.env.MONGODB_URI && !process.env.QUOTE_MONGODB_URI) {
  console.error('[QUOTE] ERROR: MongoDB URI not configured');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'quotation_app_secret_key_123';

// Initialize MongoDB connection - defer instantiation until we know MongoDB is available
let mongoManager, uploadManager, logManager;

// Initialize MongoDB and managers
async function initializeServices() {
  const offlineFlag = process.env.QUOTE_APP_OFFLINE === 'true' || process.env.QUOTE_APP_DISABLE_MONGO === 'true';

  if (offlineFlag) {
    if (!suppressLogs) console.log('[QUOTE] Running in offline mode (MongoDB disabled)');
    mongoManager = null;
    uploadManager = null;
    logManager = null;
    return;
  }

  try {
    await connectDB();
    if (!suppressLogs) console.log('[QUOTE] ✓ MongoDB connected');
  } catch (error) {
    console.error('[QUOTE] ERROR: MongoDB connection failed -', error.message);
    mongoManager = null;
    uploadManager = null;
    logManager = null;
  }
}

// Initialize Express
const app = express();

// Initialize services before starting server
initializeServices().then(() => {
  // Middleware
  app.use(express.json());
  
  // Add logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', async () => {
      const duration = Date.now() - start;
      if (logManager) {
        await logManager.info(`${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, 'quote-app', 'system', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }
    });
    next();
  });

  // Get network address
  const networkInterfaces = os.networkInterfaces();
  const ip = Object.values(networkInterfaces)
    .flat()
    .find(details => details.family === 'IPv4' && !details.internal)?.address || 'localhost';

  app.use(cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      `http://${ip}:3000`,
      `http://${ip}:5173`,
      'http://localhost:4090',
      `http://${ip}:4090`
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // Use projecthub upload middleware (only if uploadManager is available)
  let uploadMiddleware;
  if (uploadManager) {
    uploadMiddleware = uploadManager.createUploadMiddleware('quote-app', {
      uploadPath: path.join(__dirname, 'uploads'),
      maxSize: 50 * 1024 * 1024, // 50MB for video support
      allowedTypes: ['.pdf', '.png', '.jpg', '.jpeg', '.mp4', '.avi', '.mov', '.wmv', '.mkv', '.webm']
    });
  } else {
    // Create a simple fallback middleware for file uploads
    const multer = require('multer');
    const path = require('path');
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
      }
    });
    uploadMiddleware = multer({ 
      storage: storage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.mp4', '.avi', '.mov', '.wmv', '.mkv', '.webm'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('File type not allowed'), false);
        }
      }
    });
  }
  
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Routes
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/quotations', require('./routes/quotationRoutes'));
  app.use('/api/products', require('./routes/productRoutes'));
  app.use('/api/rules', require('./routes/pricingRuleRoutes'));

  // ProjectHub upload API endpoints
  app.post('/api/uploads', uploadMiddleware.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      const upload = await uploadManager.saveUpload(
        req.file,
        'quote-app',
        req.user?.id || 'anonymous',
        { originalName: req.file.originalname }
      );
      
      res.json({
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        size: upload.size,
        url: `/uploads/${upload.filename}`
      });
    } catch (error) {
      if (logManager) {
        await logManager.error('Upload failed', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message,
          file: req.file?.originalname
        });
      }
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Get uploads
  app.get('/api/uploads', async (req, res) => {
    try {
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      const uploads = await uploadManager.getUploads('quote-app', {
        userId: req.user?.id,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      });
      
      res.json(uploads);
    } catch (error) {
      if (logManager) {
        await logManager.error('Failed to get uploads', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message
        });
      }
      res.status(500).json({ error: 'Failed to get uploads' });
    }
  });

  // Download upload
  app.get('/api/uploads/:id/download', async (req, res) => {
    try {
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      if (!uploadManager) {
        return res.status(503).json({ error: 'Upload service unavailable' });
      }
      
      const upload = await uploadManager.getUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      
      if (!fs.existsSync(upload.path)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }
      
      if (uploadManager) {
        if (uploadManager) {
        await uploadManager.markDownloaded(req.params.id);
      }
      }
      
      res.download(upload.path, upload.originalName);
    } catch (error) {
      if (logManager) {
        await logManager.error('Download failed', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message,
          uploadId: req.params.id
        });
      }
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // Health endpoint with projecthub integration
  app.get('/api/health', async (req, res) => {
    try {
      let uploads = [], logs = [];
      if (uploadManager) {
        uploads = await uploadManager.getUploads('quote-app', { limit: 1 });
      }
      if (logManager) {
        logs = await logManager.getLogs({ tool: 'quote-app', limit: 1 });
      }
      
      res.status(200).json({ 
        status: 'ok',
        projecthub: {
          uploads: uploads.length,
          logs: logs.length
        }
      });
    } catch (error) {
      res.status(200).json({ 
        status: 'ok',
        projecthub: { error: error.message }
      });
    }
  });

  // Error handling middleware
  app.use(async (error, req, res, next) => {
    if (logManager) {
      await logManager.error('Server error', 'quote-app', req.user?.id || 'anonymous', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  });

  const PORT = process.env.QUOTE_PORT || 4094; // Use quote app specific port
  const HOST = process.env.HOST || '127.0.0.1';
  const TOOL_SLUG = '/tools/quote-generator'; // Slug for this tool

  // Create a sub-app for this tool to handle slug-based routing
  const toolApp = express();
  
  // Mount the tool app at the slug path FIRST, before any wildcard routes
  app.use(TOOL_SLUG, toolApp);
  
  // Move all routes to the tool sub-app
  toolApp.use('/api/users', require('./routes/userRoutes'));
  toolApp.use('/api/quotations', require('./routes/quotationRoutes'));
  toolApp.use('/api/products', require('./routes/productRoutes'));
  toolApp.use('/api/rules', require('./routes/pricingRuleRoutes'));
  
  // Move upload endpoints to tool sub-app
  toolApp.post('/api/uploads', uploadMiddleware.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const upload = await uploadManager.saveUpload(
        req.file,
        'quote-app',
        req.user?.id || 'anonymous',
        { originalName: req.file.originalname }
      );
      
      res.json({
        id: upload.id,
        filename: upload.filename,
        originalName: upload.originalName,
        size: upload.size,
        url: `${TOOL_SLUG}/uploads/${upload.filename}`
      });
    } catch (error) {
      if (logManager) {
        await logManager.error('Upload failed', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message,
          file: req.file?.originalname
        });
      }
      res.status(500).json({ error: 'Upload failed' });
    }
  });
  
  toolApp.get('/api/uploads', async (req, res) => {
    try {
      const uploads = await uploadManager.getUploads('quote-app', {
        userId: req.user?.id,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      });
      
      res.json(uploads);
    } catch (error) {
      if (logManager) {
        await logManager.error('Failed to get uploads', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message
        });
      }
      res.status(500).json({ error: 'Failed to get uploads' });
    }
  });
  
  toolApp.get('/api/uploads/:id/download', async (req, res) => {
    try {
      const upload = await uploadManager.getUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      
      if (!fs.existsSync(upload.path)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }
      
      await uploadManager.markDownloaded(req.params.id);
      
      res.download(upload.path, upload.originalName);
    } catch (error) {
      if (logManager) {
        await logManager.error('Download failed', 'quote-app', req.user?.id || 'anonymous', {
          error: error.message,
          uploadId: req.params.id
        });
      }
      res.status(500).json({ error: 'Download failed' });
    }
  });
  
  toolApp.get('/api/health', async (req, res) => {
    try {
      let uploads = [], logs = [];
      if (uploadManager) {
        uploads = await uploadManager.getUploads('quote-app', { limit: 1 });
      }
      if (logManager) {
        logs = await logManager.getLogs({ tool: 'quote-app', limit: 1 });
      }
      
      res.status(200).json({ 
        status: 'ok',
        projecthub: {
          uploads: uploads.length,
          logs: logs.length
        }
      });
    } catch (error) {
      res.status(200).json({ 
        status: 'ok',
        projecthub: { error: error.message }
      });
    }
  });
  
  // Move static file serving to tool sub-app
  toolApp.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  
  // Move frontend serving to tool sub-app
  const toolFrontendDistPath = path.join(__dirname, '../frontend/dist');
  if (fs.existsSync(toolFrontendDistPath)) {
    toolApp.use(express.static(toolFrontendDistPath));
    toolApp.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(toolFrontendDistPath, 'index.html'));
    });
  }
  
  // Add main app route for tool access
  app.get(`${TOOL_SLUG}*`, (req, res, next) => {
    // Forward to tool sub-app
    next();
  });

  // Serve frontend if built; fallback to API message only when build missing
  const frontendDistPath = path.join(__dirname, '../frontend/dist');
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.send('Quote App API is running with ProjectHub integration...');
    });
  }

  app.listen(PORT, HOST, async () => {
    // Log server startup
    if (logManager) {
      await logManager.info('Quote App server started', 'quote-app', 'system', {
        port: PORT,
        host: HOST,
        ip: ip,
        slug: TOOL_SLUG
      });
    }
    
    if (!suppressLogs) {
      console.log(`[QUOTE] ✓ Running on port ${PORT}`);
    }
  });

}).catch(error => {
  console.error('[QUOTE] ERROR: Failed to start -', error.message);
  process.exit(1);
});


