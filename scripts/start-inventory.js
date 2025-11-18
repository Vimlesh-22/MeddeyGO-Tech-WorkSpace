/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const rootEnvPath = path.join(workspaceRoot, '.env');

if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

const port = process.env.INVENTORY_PORT || process.env.PORT || '4096';
process.env.PORT = port;
process.env.INVENTORY_PORT = port;
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.SUPPRESS_PORT_MESSAGES = 'true';
process.env.SUPPRESS_LOGS = 'false';
process.env.LOG_LEVEL = 'ERROR';
process.env.DOTENV_CONFIG_SILENT = 'true';

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('[INVENTORY] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[INVENTORY] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', () => {
  console.log('[INVENTORY] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[INVENTORY] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

try {
  const serverPath = path.join(workspaceRoot, 'tools', 'inventory-management', 'backend', 'server.js');

  if (!fs.existsSync(serverPath)) {
    console.error(`[INVENTORY] ERROR: Server file not found at ${serverPath}`);
    process.exit(1);
  }

  console.log(`[INVENTORY] Starting on port ${port}...`);

  require(serverPath);

  setTimeout(() => {
    console.log('[INVENTORY] ✓ Ready');
  }, 2000);
} catch (error) {
  console.error('[INVENTORY] ERROR starting server:', error);
  console.error('[INVENTORY] Stack trace:', error.stack);
  setInterval(() => {}, 1000);
}
