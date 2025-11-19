const path = require('path');
const fs = require('fs');

// Load environment variables from project-hub/.env (2 levels up)
const envPath = path.join(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // Fallback to local .env if root .env doesn't exist
  require('dotenv').config();
}

// Load company names from env or use default
const companyNamesEnv = process.env.GSHEET_COMPANY_NAMES || 'Meddeygo,Medansh,Meddey';
const COMPANY_NAMES = companyNamesEnv.split(',').map(name => name.trim()).filter(name => name);

// Google Credentials - prefer env vars, fallback to file
const { getGoogleCredentials } = require('../../../_shared/utils/googleCredentials');
let GOOGLE_CREDENTIALS;
let CREDENTIALS_FILE;

try {
  // Check for credentials.json files as fallback
  const rootCredentialsPath = path.join(__dirname, '..', '..', '..', 'credentials.json');
  const localCredentialsPath = path.join(__dirname, '..', 'credentials.json');
  const fallbackPath = fs.existsSync(rootCredentialsPath) 
    ? rootCredentialsPath 
    : (fs.existsSync(localCredentialsPath) ? localCredentialsPath : null);

  GOOGLE_CREDENTIALS = getGoogleCredentials(fallbackPath);
  CREDENTIALS_FILE = fallbackPath; // For backward compatibility
} catch (error) {
  console.error('[GSHEET Config] Warning:', error.message);
  GOOGLE_CREDENTIALS = null;
  CREDENTIALS_FILE = null;
}

// Log file path - use project-hub root logs directory
const logsDir = path.join(__dirname, '..', '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const LOG_FILE = path.join(logsDir, process.env.GSHEET_LOG_FILE || 'gsheet_wizard_updates.log');

module.exports = {
  PORT: process.env.GSHEET_PORT || 4095, // Use gsheet specific port
  COMPANY_NAMES,
  DEFAULT_GOOGLE_SHEET_ID: process.env.GSHEET_GOOGLE_SHEET_ID || '',
  CREDENTIALS_FILE, // For backward compatibility
  GOOGLE_CREDENTIALS, // New: credentials object from env vars
  LOG_FILE
};
