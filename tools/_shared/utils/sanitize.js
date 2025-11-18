/**
 * Input Sanitization Utilities
 * Prevents SQL injection, XSS, and other injection attacks
 */

/**
 * Sanitize string for use in MongoDB regex
 * Prevents NoSQL injection attacks
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized string safe for regex
 */
function sanitizeForRegex(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Escape special regex characters
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
}

/**
 * Sanitize SKU input
 * @param {string} sku - SKU to sanitize
 * @returns {string} Sanitized SKU
 */
function sanitizeSku(sku) {
  if (!sku || typeof sku !== 'string') {
    return '';
  }
  // Remove special characters, keep alphanumeric, hyphen, underscore
  return sku.replace(/[^a-zA-Z0-9\-_]/g, '').trim().toUpperCase();
}

/**
 * Sanitize email address
 * @param {string} email - Email to sanitize
 * @returns {string|null} Sanitized email or null if invalid
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(trimmed) ? trimmed : null;
}

/**
 * Sanitize phone number
 * @param {string|number} phone - Phone number to sanitize
 * @returns {string|null} Normalized phone number or null
 */
function sanitizePhone(phone) {
  if (!phone) {
    return null;
  }
  
  const phoneStr = String(phone).trim();
  if (!phoneStr || phoneStr.toLowerCase() === 'nan' || phoneStr === 'null') {
    return null;
  }
  
  // Extract only digits
  const digits = phoneStr.replace(/\D/g, '');
  
  // Must have at least 7 digits
  if (digits.length < 7) {
    return null;
  }
  
  // For international numbers, keep last 10 digits
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  
  return digits;
}

/**
 * Sanitize filename for safe file system operations
 * @param {string} filename - Original filename
 * @returns {string} Safe filename
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }
  
  // Remove path traversal attempts
  let safe = filename.replace(/\.\./g, '');
  
  // Remove or replace unsafe characters
  safe = safe.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  
  // Remove leading/trailing dots and spaces
  safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
  
  // Limit length
  if (safe.length > 255) {
    const ext = safe.split('.').pop();
    const name = safe.slice(0, 255 - ext.length - 1);
    safe = `${name}.${ext}`;
  }
  
  return safe || 'unnamed_file';
}

/**
 * Sanitize object for MongoDB query
 * Removes properties starting with $ to prevent operator injection
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeMongoQuery(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMongoQuery);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip keys starting with $ (MongoDB operators)
    if (key.startsWith('$')) {
      continue;
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeMongoQuery(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Backwards-compatible sanitizer used by shared middleware.
 * Currently mirrors sanitizeMongoQuery but can be extended for other rules.
 * @param {Object} obj
 * @returns {Object}
 */
function sanitizeObject(obj) {
  return sanitizeMongoQuery(obj);
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @returns {string|null} Valid URL or null
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  try {
    const parsed = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize HTML to prevent XSS
 * Basic implementation - use a library like DOMPurify for production
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

module.exports = {
  sanitizeForRegex,
  sanitizeSku,
  sanitizeEmail,
  sanitizePhone,
  sanitizeFilename,
  sanitizeMongoQuery,
  sanitizeObject,
  sanitizeUrl,
  sanitizeHtml
};
