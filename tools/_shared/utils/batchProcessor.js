/**
 * Batch Processing Utility
 * Process large datasets in chunks to prevent memory overflow
 */

const logger = require('./logger');

/**
 * Process array in batches
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each batch
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Results from all batches
 */
async function processBatch(items, processor, options = {}) {
  const {
    batchSize = 1000,
    delay = 0, // Delay between batches (ms)
    onProgress = null, // Progress callback
    continueOnError = false // Continue processing if a batch fails
  } = options;

  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  logger.info('Starting batch processing', {
    totalItems: items.length,
    batchSize,
    totalBatches
  });

  for (let i = 0; i < items.length; i += batchSize) {
    const batchNumber = Math.floor(i / batchSize) + 1;
    const batch = items.slice(i, i + batchSize);

    try {
      logger.debug(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchNumber,
        batchSize: batch.length,
        startIndex: i
      });

      const batchResult = await processor(batch, batchNumber);
      results.push(...(Array.isArray(batchResult) ? batchResult : [batchResult]));

      if (onProgress) {
        onProgress({
          batchNumber,
          totalBatches,
          processedItems: Math.min(i + batchSize, items.length),
          totalItems: items.length,
          percentage: Math.min(((i + batchSize) / items.length) * 100, 100)
        });
      }

      // Add delay between batches if specified
      if (delay > 0 && batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      logger.error(`Batch ${batchNumber} processing failed`, {
        error: error.message,
        batchNumber,
        batchSize: batch.length
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  logger.info('Batch processing completed', {
    totalBatches,
    totalResults: results.length
  });

  return results;
}

/**
 * Process items with concurrent batch processing
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Results from all items
 */
async function processConcurrentBatch(items, processor, options = {}) {
  const {
    concurrency = 5, // Number of concurrent operations
    onProgress = null,
    continueOnError = false
  } = options;

  const results = [];
  const total = items.length;
  let completed = 0;

  logger.info('Starting concurrent batch processing', {
    totalItems: total,
    concurrency
  });

  // Process items in chunks based on concurrency
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    
    try {
      const chunkResults = await Promise.all(
        chunk.map(async (item, index) => {
          try {
            return await processor(item, i + index);
          } catch (error) {
            if (!continueOnError) {
              throw error;
            }
            logger.warn('Item processing failed', {
              index: i + index,
              error: error.message
            });
            return null;
          }
        })
      );

      results.push(...chunkResults);
      completed += chunk.length;

      if (onProgress) {
        onProgress({
          completed,
          total,
          percentage: (completed / total) * 100
        });
      }
    } catch (error) {
      logger.error('Concurrent batch processing failed', {
        error: error.message,
        startIndex: i
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  logger.info('Concurrent batch processing completed', {
    totalProcessed: completed,
    successfulResults: results.filter(r => r !== null).length
  });

  return results;
}

/**
 * Stream process large datasets
 * @param {AsyncIterable} stream - Async iterable stream
 * @param {Function} processor - Function to process each item
 * @param {Object} options - Processing options
 */
async function* streamProcess(stream, processor, options = {}) {
  const {
    batchSize = 100,
    onProgress = null
  } = options;

  let buffer = [];
  let processed = 0;

  for await (const item of stream) {
    buffer.push(item);

    if (buffer.length >= batchSize) {
      const batch = buffer;
      buffer = [];
      
      const results = await processor(batch);
      processed += batch.length;

      if (onProgress) {
        onProgress({ processed });
      }

      yield results;
    }
  }

  // Process remaining items
  if (buffer.length > 0) {
    const results = await processor(buffer);
    processed += buffer.length;

    if (onProgress) {
      onProgress({ processed });
    }

    yield results;
  }
}

module.exports = {
  processBatch,
  processConcurrentBatch,
  streamProcess
};