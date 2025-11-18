/**
 * Environment Variable Validation Utility
 * Validates required environment variables at application startup
 */

const logger = require('./logger');

class EnvironmentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validate required environment variables
 * @param {Object} schema - Object with env var names and validation rules
 * @returns {Object} Validated environment variables
 * @throws {EnvironmentValidationError} If validation fails
 * 
 * @example
 * const env = validateEnvironment({
 *   PORT: { required: true, type: 'number', default: 3000 },
 *   MONGODB_URI: { required: true, type: 'string' },
 *   NODE_ENV: { required: false, type: 'string', default: 'development' }
 * });
 */
function validateEnvironment(schema) {
  const errors = [];
  const validated = {};
  const warnings = [];

  for (const [key, rules] of Object.entries(schema)) {
    const value = process.env[key];
    const { required = false, type = 'string', default: defaultValue, validator } = rules;

    // Check if required
    if (required && !value && defaultValue === undefined) {
      errors.push(`${key} is required but not set`);
      continue;
    }

    // Use default if not provided
    const finalValue = value || defaultValue;

    if (finalValue === undefined) {
      validated[key] = undefined;
      continue;
    }

    // Type validation
    try {
      switch (type) {
        case 'number':
          const num = Number(finalValue);
          if (isNaN(num)) {
            errors.push(`${key} must be a number, got: ${finalValue}`);
          } else {
            validated[key] = num;
          }
          break;

        case 'boolean':
          validated[key] = finalValue === 'true' || finalValue === '1' || finalValue === true;
          break;

        case 'array':
          validated[key] = typeof finalValue === 'string' 
            ? finalValue.split(',').map(s => s.trim()).filter(Boolean)
            : finalValue;
          break;

        case 'json':
          try {
            validated[key] = JSON.parse(finalValue);
          } catch (e) {
            errors.push(`${key} must be valid JSON`);
          }
          break;

        case 'url':
          try {
            new URL(finalValue);
            validated[key] = finalValue;
          } catch (e) {
            errors.push(`${key} must be a valid URL`);
          }
          break;

        default: // 'string'
          validated[key] = String(finalValue);
      }

      // Custom validator
      if (validator && typeof validator === 'function') {
        const validationResult = validator(validated[key]);
        if (validationResult !== true) {
          errors.push(`${key} validation failed: ${validationResult}`);
        }
      }

      // Warn if using default
      if (!value && defaultValue !== undefined) {
        warnings.push(`${key} not set, using default: ${defaultValue}`);
      }

    } catch (error) {
      errors.push(`${key} validation error: ${error.message}`);
    }
  }

  // Log warnings
  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    warnings.forEach(warning => logger.warn(warning));
  }

  // Throw if errors
  if (errors.length > 0) {
    const errorMessage = `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    logger.fatal(errorMessage);
    throw new EnvironmentValidationError(errorMessage);
  }

  logger.info('Environment validation successful', {
    validatedKeys: Object.keys(validated),
    env: validated.NODE_ENV
  });

  return validated;
}

/**
 * Common environment schemas for different services
 */
const commonSchemas = {
  backend: {
    NODE_ENV: { required: false, type: 'string', default: 'development' },
    PORT: { required: true, type: 'number', default: 3000 },
    MONGODB_URI: { required: true, type: 'string' },
    LOG_LEVEL: { required: false, type: 'string', default: 'INFO' }
  },
  
  frontend: {
    NODE_ENV: { required: false, type: 'string', default: 'development' },
    VITE_API_URL: { required: false, type: 'url' },
    VITE_APP_NAME: { required: false, type: 'string', default: 'MeddeyGo' }
  }
};

module.exports = {
  validateEnvironment,
  commonSchemas,
  EnvironmentValidationError
};