/**
 * Centralized Environment Variable Loader
 * 
 * This utility ensures all tools load environment variables from project-hub/.env
 * It should be called early in each tool's startup process
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * Load environment variables from project-hub/.env
 * @param {string} toolPath - Path to the tool directory (relative to project-hub)
 * @returns {object} - Result object with success status and loaded variables count
 */
function loadRootEnv(toolPath = '') {
  // Calculate path to project-hub root
  // If toolPath is provided, go up from tool directory to project-hub
  // Otherwise, assume we're already in project-hub
  let rootPath;
  
  if (toolPath) {
    // Resolve from tool directory to project-hub root
    rootPath = path.resolve(__dirname, '..', '..');
  } else {
    // Already in project-hub root
    rootPath = path.resolve(__dirname, '..');
  }
  
  const envPath = path.join(rootPath, '.env');
  
  if (!fs.existsSync(envPath)) {
    console.warn(`[ENV] Warning: .env file not found at ${envPath}`);
    console.warn(`[ENV] Some features may not work without proper environment configuration`);
    return { success: false, envPath, loaded: 0 };
  }
  
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    console.error(`[ENV] Error loading .env from ${envPath}:`, result.error);
    return { success: false, envPath, error: result.error, loaded: 0 };
  }
  
  const loadedCount = Object.keys(result.parsed || {}).length;
  console.log(`[ENV] Loaded ${loadedCount} environment variables from ${envPath}`);
  
  return { success: true, envPath, loaded: loadedCount };
}

/**
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required variable names
 * @param {string} toolName - Name of the tool (for error messages)
 * @throws {Error} If any required variable is missing
 */
function validateRequiredEnv(requiredVars, toolName = 'Tool') {
  const missing = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    const errorMessage = `[${toolName}] Missing required environment variables: ${missing.join(', ')}\n` +
      `Please set these variables in project-hub/.env`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  console.log(`[${toolName}] ✓ All required environment variables are set`);
}

module.exports = {
  loadRootEnv,
  validateRequiredEnv,
};

