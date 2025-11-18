/**
 * Google Service Account Credentials Utility
 * Builds credentials object from environment variables
 * This allows storing sensitive credentials securely in .env instead of files
 */

const fs = require('fs');
const path = require('path');

/**
 * Get Google Service Account credentials from environment variables or file
 * @param {string} fallbackPath - Optional path to credentials.json file as fallback
 * @returns {Object} Google Service Account credentials object
 */
function getGoogleCredentials(fallbackPath = null) {
  // Try to build credentials from environment variables first
  if (process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    console.log('[Google Credentials] Loading from environment variables');
    
    return {
      type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
      project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
      private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
      auth_uri: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_CERT_URL,
      universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN || 'googleapis.com'
    };
  }

  // Try GOOGLE_APPLICATION_CREDENTIALS environment variable
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(credPath)) {
      console.log('[Google Credentials] Loading from GOOGLE_APPLICATION_CREDENTIALS:', credPath);
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    }
  }

  // Fallback to file path if provided
  if (fallbackPath) {
    const fullPath = path.resolve(fallbackPath);
    if (fs.existsSync(fullPath)) {
      console.log('[Google Credentials] Loading from fallback file:', fullPath);
      return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
  }

  // No credentials found
  console.error('[Google Credentials] ERROR: No credentials found!');
  console.error('[Google Credentials] Please set either:');
  console.error('  1. GOOGLE_SERVICE_ACCOUNT_* environment variables in .env, OR');
  console.error('  2. GOOGLE_APPLICATION_CREDENTIALS pointing to credentials.json, OR');
  console.error('  3. Provide a valid fallback path to credentials.json');
  
  throw new Error('Google Service Account credentials not configured');
}

/**
 * Write credentials to a temporary file (for libraries that require file path)
 * @param {Object} credentials - Credentials object
 * @returns {string} Path to temporary credentials file
 */
function writeCredentialsToTempFile(credentials) {
  const tmpDir = path.join(process.cwd(), '.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const tmpPath = path.join(tmpDir, 'google-credentials.json');
  fs.writeFileSync(tmpPath, JSON.stringify(credentials, null, 2));
  
  console.log('[Google Credentials] Temporary credentials file created:', tmpPath);
  return tmpPath;
}

module.exports = {
  getGoogleCredentials,
  writeCredentialsToTempFile
};
