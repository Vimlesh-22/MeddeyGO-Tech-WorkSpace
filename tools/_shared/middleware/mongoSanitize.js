/**
 * MongoDB Query Sanitization Middleware
 * Prevents NoSQL injection attacks by sanitizing all incoming request data
 * 
 * Usage:
 *   const { sanitizeRequest } = require('./_shared/middleware/mongoSanitize');
 *   app.use(sanitizeRequest());
 */

const { sanitizeObject } = require('../utils/sanitize');

/**
 * Express middleware to sanitize request body, query, and params
 * Removes $ and . characters that could be used for NoSQL injection
 */
function sanitizeRequest() {
  return (req, res, next) => {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  };
}

/**
 * Sanitize MongoDB query object before execution
 * Use this for queries constructed from user input
 * 
 * @example
 * const query = sanitizeQuery({ email: userInput });
 * const user = await User.findOne(query);
 */
function sanitizeQuery(query) {
  return sanitizeObject(query);
}

/**
 * Sanitize MongoDB update object before execution
 * Prevents injection through update operations
 * 
 * @example
 * const update = sanitizeUpdate({ name: req.body.name });
 * await User.updateOne({ _id: id }, update);
 */
function sanitizeUpdate(update) {
  return sanitizeObject(update);
}

module.exports = {
  sanitizeRequest,
  sanitizeQuery,
  sanitizeUpdate
};