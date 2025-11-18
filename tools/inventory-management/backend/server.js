const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const compression = require('compression');
const apicache = require('apicache');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { sanitizeRequest } = require('../../_shared/middleware/mongoSanitize');
const { cleanupOldHistory, ensureHistoryTtlIndex } = require('./services/historyCleanupService');
const { startProcessedOrdersScheduler } = require('./jobs/processedOrdersScheduler');

// Load environment variables from project-hub/.env (project root)
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath, override: true });

// Import shared utilities
const logger = require('../../_shared/utils/logger');
const { validateEnvironment } = require('../../_shared/utils/validateEnv');

// Validate environment variables
const env = validateEnvironment({
  INVENTORY_MONGODB_URI: { required: false },
  MONGODB_URI: { required: false },
  INVENTORY_PORT: { type: 'number', default: 4096 },
  PORT: { type: 'number' },
  NODE_ENV: { default: 'development' },
  HOST: { default: '0.0.0.0' },
  SUPPRESS_PORT_MESSAGES: { type: 'boolean', default: false }
});

// Check for MongoDB URI
if (!env.INVENTORY_MONGODB_URI && !env.MONGODB_URI) {
  logger.error('Missing required environment variables', {
    context: {
      service: 'inventory-management',
      requiredVars: ['INVENTORY_MONGODB_URI', 'MONGODB_URI']
    }
  });
}

const app = express();

// Initialize cache
const cache = apicache.middleware;

// Middleware
// Disable ETag to avoid 304 Not Modified responses in API logs
app.set('etag', false);
app.use(cors());
app.use(compression()); // Add compression for faster response times
app.use(express.json());

// NoSQL injection protection - must be after express.json()
app.use(sanitizeRequest());

// Fix malformed proxy paths - strip duplicate /_proxy/inventory-management/api prefix
app.use((req, res, next) => {
  // Check if the path has the malformed pattern: /api/_proxy/inventory-management/api/...
  if (req.path.startsWith('/api/_proxy/inventory-management/api/')) {
    // Strip the /_proxy/inventory-management/api part, keeping just /api/...
    req.url = req.url.replace('/api/_proxy/inventory-management/api/', '/api/');
    console.log(`[Inventory] Fixed malformed proxy path: ${req.path} -> ${req.url}`);
  }
  next();
});

app.use(morgan('dev'));

// MongoDB Connection with optimized settings
// SECURITY: Require MongoDB URI from environment, no hardcoded fallback
const mongoUri = env.INVENTORY_MONGODB_URI || env.MONGODB_URI;

if (!mongoUri) {
  logger.error('MongoDB URI not configured', {
    context: { service: 'inventory-management' }
  });
} else {
  logger.info('Connecting to MongoDB...', {
    context: { service: 'inventory-management' }
  });
}

// Set a timeout to prevent hanging
const mongoConnectionTimeout = setTimeout(() => {
  if (mongoose.connection.readyState === 0) {
    logger.warn('MongoDB connection is taking longer than expected', {
      context: { service: 'inventory-management' }
    });
  }
}, 5000);

if (mongoUri) {
  mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => {
    clearTimeout(mongoConnectionTimeout);
    logger.info('MongoDB Connected', {
      context: { service: 'inventory-management' }
    });
  })
  .catch(err => {
    clearTimeout(mongoConnectionTimeout);
    logger.error('MongoDB Connection Error', {
      error: err,
      context: { service: 'inventory-management' }
    });
    // Don't exit - allow server to start even if MongoDB fails
  });
}

// Serve static files from the React app if it has been built
const clientDistPath = path.join(__dirname, '../frontend/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
const hasClientDist = fs.existsSync(clientDistPath);

if (hasClientDist) {
  app.use(express.static(clientDistPath));
  if (fs.existsSync(clientIndexPath)) {
    logger.info('Serving built inventory-management frontend', {
      context: { service: 'inventory-management', path: clientDistPath }
    });
  } else {
    logger.warn('Inventory-management frontend directory exists but index.html missing', {
      context: { service: 'inventory-management', clientDistPath }
    });
  }
} else {
  logger.warn('Inventory-management frontend build not found - API will still run', {
    context: { service: 'inventory-management', clientDistPath }
  });
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Cache middleware for GET requests
const cacheSuccessfulGETsMiddleware = cache('5 minutes', (req, res) => {
  // Only cache GET requests
  if (req.method === 'GET') {
    // Don't cache PDF downloads, export requests, or product price requests (they change frequently)
    if (req.url.includes('/vendor-pdf') || req.url.includes('/export') || req.url.includes('/products/price/')) {
      return false;
    }
    return res.statusCode === 200;
  }
  return false;
});

// Request logging middleware - use structured logger
app.use((req, res, next) => {
  logger.debug('Request received', {
    context: {
      service: 'inventory-management',
      method: req.method,
      url: req.url,
      ip: req.ip
    }
  });
  next();
});

// Normalize duplicate API prefixes (e.g., /api/api/orders -> /api/orders)
app.use((req, res, next) => {
  if (typeof req.url === 'string' && req.url.startsWith('/api/api')) {
    const normalizedUrl = req.url.replace('/api/api', '/api');
    logger.warn('Normalized request path to remove duplicate /api prefix', {
      context: { service: 'inventory-management' },
      originalUrl: req.url,
      normalizedUrl
    });
    req.url = normalizedUrl;
    req.originalUrl = normalizedUrl;
  }
  next();
});

// Routes - wrap in try-catch to prevent silent failures
try {
  // Do NOT cache orders to ensure updates (e.g., vendor changes) reflect immediately
  app.use('/api/orders', require('./routes/orderRoutes'));
  logger.info('Orders routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading orders routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/vendors', cacheSuccessfulGETsMiddleware, require('./routes/vendorRoutes'));
  logger.info('Vendors routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading vendors routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/products', cacheSuccessfulGETsMiddleware, require('./routes/productRoutes'));
  logger.info('Products routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading products routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/inventory', require('./routes/inventoryRoutes'));
  logger.info('Inventory routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading inventory routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/activities', require('./routes/activityRoutes'));
  logger.info('Activities routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading activities routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/settings', require('./routes/settingsRoutes'));
  logger.info('Settings routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading settings routes', { error, context: { service: 'inventory-management' } });
}

try {
  app.use('/api/reminders', require('./routes/reminderRoutes'));
  logger.info('Reminders routes loaded', { context: { service: 'inventory-management' } });
} catch (error) {
  logger.error('Error loading reminders routes', { error, context: { service: 'inventory-management' } });
}

// Helper used when the client build is missing so Hub proxy doesn't receive a 500
const sendFrontendFallback = (res) => {
  res.status(200).type('html').send(`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Inventory Management API</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
        .card { max-width:520px; padding:32px; background:#1e293b; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.35); }
        h1 { font-size:1.75rem; margin-bottom:0.75rem; }
        p { line-height:1.5; margin-bottom:1rem; color:#94a3b8; }
        code { background:#0f172a; padding:2px 6px; border-radius:8px; color:#f8fafc; }
        ul { padding-left:20px; color:#cbd5f5; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Inventory Management API</h1>
        <p>The backend is running, but the React client build was not found. To enable the UI, run:</p>
        <ul>
          <li><code>cd project-hub/tools/inventory-management/frontend</code></li>
          <li><code>npm install</code></li>
          <li><code>npm run build</code></li>
        </ul>
        <p>You can continue using the API endpoints under <code>/api</code> while the UI is rebuilt.</p>
      </div>
    </body>
  </html>`);
};

// Handle React routing, return all non-API requests to React app
app.get('*', (req, res, next) => {
  // Skip API routes and static assets
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
    return next();
  }

  const indexPath = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  logger.warn('Frontend build missing - responding with fallback page', {
    context: { service: 'inventory-management', requestedPath: req.path }
  });
  return sendFrontendFallback(res);
});

// Error Handling - must be last
app.use(notFound);
app.use(errorHandler);

// Use environment variable or default to 4096 for sequential port allocation
const PORT = env.INVENTORY_PORT || env.PORT;

// Try alternative ports if the main one is busy
function startServer(port) {
  const suppressMessages = env.SUPPRESS_PORT_MESSAGES;
  const host = env.HOST || (suppressMessages ? '127.0.0.1' : '0.0.0.0');
  
  logger.info(`Attempting to start server on port ${port}`, {
    context: { service: 'inventory-management', port }
  });
  
  const server = app.listen(port, host, () => {
    if (suppressMessages) {
      logger.info(`Server running on http://127.0.0.1:${port}`, {
        context: { service: 'inventory-management', port }
      });
    } else {
      const ip = require('ip');
      const localIP = ip.address();
      logger.info('Server running', {
        context: {
          service: 'inventory-management',
          port,
          local: `http://localhost:${port}`,
          network: `http://${localIP}:${port}`
        }
      });
    }
    
    // Update port registry with proper error handling
    try {
      const portsPath = path.join(__dirname, '..', '..', '.ports.json');
      let current = {};
      if (fs.existsSync(portsPath)) {
        try {
          current = JSON.parse(fs.readFileSync(portsPath, 'utf-8'));
        } catch (parseError) {
          logger.warn('Failed to parse ports file', { error: parseError });
        }
      }
      current['inventory-management'] = { port };
      fs.writeFileSync(portsPath, JSON.stringify(current, null, 2));
      logger.info('Port registry updated', {
        context: { service: 'inventory-management', portsPath }
      });
    } catch (error) {
      logger.warn('Failed to update port registry', { error });
    }
    
    logger.info('Server is ready and listening for requests', {
      context: { service: 'inventory-management' }
    });
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${port} is already in use. Trying port ${port + 1}`, {
        context: { service: 'inventory-management', port }
      });
      startServer(port + 1);
    } else {
      logger.error('Server error', {
        error: err,
        context: { service: 'inventory-management' }
      });
      // Keep process running to show error in concurrently
      setTimeout(() => {
        logger.error('Server failed to start. Check error above.', {
          context: { service: 'inventory-management' }
        });
      }, 1000);
    }
  });
  
  // Handle server close gracefully
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing server...', {
      context: { service: 'inventory-management' }
    });
    server.close(() => {
      logger.info('Server closed', {
        context: { service: 'inventory-management' }
      });
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, closing server...', {
      context: { service: 'inventory-management' }
    });
    server.close(() => {
      logger.info('Server closed', {
        context: { service: 'inventory-management' }
      });
      process.exit(0);
    });
  });
}

// Schedule daily cleanup of old history records (runs daily)
// SAFETY: Only cleans ProcessedOrderHistory records, does NOT affect Orders, Vendors, Products, or any other data
const scheduleHistoryCleanup = () => {
  const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  // Run cleanup immediately on startup (for testing/debugging)
  cleanupOldHistory().then(result => {
    if (result.success) {
      logger.info('Startup cleanup completed', {
        context: {
          service: 'inventory-management',
          deletedCount: result.deletedCount,
          note: 'Only ProcessedOrderHistory records affected'
        }
      });
    }
  }).catch(error => {
    logger.error('Startup cleanup failed', { error });
  });
  
  // Schedule daily cleanup - ONLY affects ProcessedOrderHistory collection
  setInterval(async () => {
    try {
      const result = await cleanupOldHistory();
      if (result.success) {
        logger.info('Scheduled cleanup completed', {
          context: {
            service: 'inventory-management',
            deletedCount: result.deletedCount,
            note: 'Only ProcessedOrderHistory records affected'
          }
        });
      }
    } catch (error) {
      logger.error('Scheduled cleanup failed', { error });
    }
  }, cleanupInterval);
  
  logger.info('Scheduled daily cleanup job initialized', {
    context: {
      service: 'inventory-management',
      note: 'Only cleans ProcessedOrderHistory (orders/vendors/products are NOT affected)'
    }
  });
};

// Initialize cleanup scheduler after MongoDB connection
mongoose.connection.once('open', async () => {
  try {
    logger.info('MongoDB connected, initializing services...', {
      context: { service: 'inventory-management' }
    });
    await ensureHistoryTtlIndex();
    scheduleHistoryCleanup();
    // Initialize processed orders scheduler (auto-move Pending to Processed)
    startProcessedOrdersScheduler(app);
    logger.info('All services initialized successfully', {
      context: { service: 'inventory-management' }
    });
  } catch (error) {
    logger.error('Error initializing services', {
      error,
      context: { service: 'inventory-management' }
    });
    // Continue even if initialization fails
  }
});

// Start the server
logger.info('Initializing server...', {
  context: { service: 'inventory-management' }
});
startServer(PORT);
// Simple health endpoint for proxy verification
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'inventory-management', time: new Date().toISOString() });
});
