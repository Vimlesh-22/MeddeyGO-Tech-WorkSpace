/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const rootEnvPath = path.join(workspaceRoot, '.env');

// Load environment variables from project-hub/.env
if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
}

// Set port and host for integrated mode
const port = process.env.GSHEET_PORT || process.env.PORT || '4095';
process.env.PORT = port;
process.env.GSHEET_PORT = port;
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.SUPPRESS_PORT_MESSAGES = 'true';
process.env.SUPPRESS_LOGS = 'false';
process.env.LOG_LEVEL = 'ERROR';
process.env.DOTENV_CONFIG_SILENT = 'true';

console.log('[GSHEET] Starting on port ' + port + '...');

const serverPath = path.join(workspaceRoot, 'tools', 'GSHEET', 'server', 'index.js');
require(serverPath);
