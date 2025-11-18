/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per IP address
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const logger = require('../utils/logger');

/**
 * Create a rate limiter with custom options
 * @param {Object} options - Rate limiter configuration
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests from this IP, please try again later.',
    standardHeaders = true, // Return rate limit info in headers
    legacyHeaders = false, // Disable X-RateLimit-* headers
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip, // Use IP as key
    handler = (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        status: 'error',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    ...customOptions
  } = options;

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator,
    handler,
    ...customOptions
  });
}

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * API rate limiter for general endpoints
 */
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests, please try again later.'
});

/**
 * File upload rate limiter
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour
  message: 'Too many file uploads, please try again later.'
});

/**
 * Strict rate limiter for sensitive operations
 */
const strictLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Rate limit exceeded for sensitive operation.'
});

module.exports = {
  createRateLimiter,
  authLimiter,
  apiLimiter,
  uploadLimiter,
  strictLimiter
};