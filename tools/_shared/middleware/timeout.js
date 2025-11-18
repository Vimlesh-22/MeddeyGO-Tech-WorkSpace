/**
 * Request Timeout Middleware
 * Prevents long-running requests from blocking the server
 */

const logger = require('../utils/logger');

/**
 * Create timeout middleware
 * @param {number} ms - Timeout in milliseconds (default: 30 seconds)
 * @returns {Function} Express middleware
 */
function createTimeout(ms = 30000) {
  return (req, res, next) => {
    // Set timeout on request
    req.setTimeout(ms, () => {
      logger.error('Request timeout', {
        method: req.method,
        url: req.url,
        timeout: ms,
        ip: req.ip
      });
      
      if (!res.headersSent) {
        res.status(408).json({
          status: 'error',
          message: 'Request timeout',
          code: 'REQUEST_TIMEOUT'
        });
      }
    });

    // Set timeout on response
    res.setTimeout(ms, () => {
      logger.error('Response timeout', {
        method: req.method,
        url: req.url,
        timeout: ms,
        ip: req.ip
      });
      
      if (!res.headersSent) {
        res.status(504).json({
          status: 'error',
          message: 'Gateway timeout',
          code: 'GATEWAY_TIMEOUT'
        });
      }
    });

    next();
  };
}

/**
 * Short timeout for quick operations (10 seconds)
 */
const shortTimeout = createTimeout(10000);

/**
 * Standard timeout for normal operations (30 seconds)
 */
const standardTimeout = createTimeout(30000);

/**
 * Long timeout for file processing (2 minutes)
 */
const longTimeout = createTimeout(120000);

/**
 * Extended timeout for batch operations (5 minutes)
 */
const extendedTimeout = createTimeout(300000);

module.exports = {
  createTimeout,
  shortTimeout,
  standardTimeout,
  longTimeout,
  extendedTimeout
};