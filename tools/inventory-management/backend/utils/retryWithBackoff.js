/**
 * Retry utility with exponential backoff for handling rate limit errors
 */

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 1000; // 1 second
const DEFAULT_MAX_DELAY_MS = 60000; // 60 seconds
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/**
 * Check if error is a rate limit/quota error
 */
function isRateLimitError(error) {
  if (!error) return false;
  
  const code = error.code || error.status || error.response?.status;
  const message = String(error.message || error.response?.data?.message || '').toLowerCase();
  
  // Check for 429 status code (Too Many Requests)
  if (code === 429) return true;
  
  // Check for quota exceeded messages
  if (message.includes('quota exceeded') || 
      message.includes('rate limit') || 
      message.includes('resource_exhausted') ||
      message.includes('user_rate_limit')) {
    return true;
  }
  
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {Number} options.maxRetries - Maximum number of retries (default: 5)
 * @param {Number} options.initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @param {Number} options.maxDelayMs - Maximum delay in milliseconds (default: 60000)
 * @param {Number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried (default: checks for rate limit)
 * @param {Function} options.onRetry - Callback called before each retry attempt
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    shouldRetry = isRateLimitError,
    onRetry = null
  } = options;
  
  let lastError;
  let delay = initialDelayMs;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      const shouldRetryError = typeof shouldRetry === 'function' 
        ? shouldRetry(error) 
        : isRateLimitError(error);
      
      // Don't retry if:
      // - It's not a retryable error
      // - We've exhausted all retries
      if (!shouldRetryError || attempt >= maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const currentDelay = Math.min(delay, maxDelayMs);
      
      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === 'function') {
        onRetry(attempt + 1, maxRetries, currentDelay, error);
      }
      
      console.log(`[retryWithBackoff] Rate limit hit, retrying in ${currentDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
      
      // Wait before retrying
      await sleep(currentDelay);
      
      // Increase delay for next retry (exponential backoff)
      delay *= backoffMultiplier;
    }
  }
  
  // This should never be reached, but TypeScript/static analysis might want it
  throw lastError;
}

/**
 * Batch retry with exponential backoff for array of operations
 * @param {Array} items - Array of items to process
 * @param {Function} processor - Async function that processes each item
 * @param {Object} options - Retry options (same as retryWithBackoff)
 * @returns {Promise<Object>} Object with successful and failed items
 */
async function batchRetryWithBackoff(items, processor, options = {}) {
  const results = {
    successful: [],
    failed: [],
    retried: []
  };
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let retryCount = 0;
    
    try {
      const result = await retryWithBackoff(
        () => processor(item),
        {
          ...options,
          onRetry: (attempt, maxRetries, delay, error) => {
            retryCount = attempt;
            if (options.onRetry) {
              options.onRetry(item, attempt, maxRetries, delay, error);
            }
          }
        }
      );
      
      results.successful.push({
        item,
        result,
        retryCount
      });
    } catch (error) {
      results.failed.push({
        item,
        error: error.message || String(error),
        retryCount
      });
    }
  }
  
  return results;
}

module.exports = {
  retryWithBackoff,
  batchRetryWithBackoff,
  isRateLimitError,
  sleep
};

