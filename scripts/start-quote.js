/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const rootEnvPath = path.join(workspaceRoot, '.env');

if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

const port = process.env.QUOTE_PORT || process.env.PORT || '4094';
process.env.PORT = port;
process.env.QUOTE_PORT = port;
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.SUPPRESS_PORT_MESSAGES = 'true';
process.env.SUPPRESS_LOGS = 'false';
process.env.LOG_LEVEL = 'ERROR';
process.env.DOTENV_CONFIG_SILENT = 'true';

// Force DB mode unless explicitly disabled
process.env.QUOTE_APP_OFFLINE = process.env.QUOTE_APP_OFFLINE || 'false';
process.env.QUOTE_APP_DISABLE_MONGO = process.env.QUOTE_APP_DISABLE_MONGO || 'false';

// Ensure MongoDB URI is loaded from .env
if (!process.env.MONGODB_URI && !process.env.QUOTE_MONGODB_URI) {
  console.error('[QUOTE] ERROR: MongoDB URI not configured');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'quotation_app_secret_key_123';

console.log('[QUOTE] Starting on port ' + port + '...');

const serverPath = path.join(workspaceRoot, 'tools', 'quote-app', 'backend', 'server.js');
require(serverPath);
