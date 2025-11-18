/**
 * Background sync service for processing transactions with retry logic
 * Tracks progress and retries failed transactions
 */

const InventoryTransaction = require('../models/InventoryTransaction');
const { batchUpdateInventoryTransactions } = require('./googleSheets');
const { retryWithBackoff, isRateLimitError } = require('../utils/retryWithBackoff');

// In-memory job store (in production, use Redis or a database)
const activeJobs = new Map(); // jobId -> { status, progress, results, errors }

const OKHLA_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_OKHLA_SHEET_ID;
const BAHADURGARH_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_BAHADURGARH_SHEET_ID;
const INVENTORY_TAB_NAME = process.env.GOOGLE_SHEETS_INVENTORY_TAB_NAME;

if (!OKHLA_SPREADSHEET_ID || !BAHADURGARH_SPREADSHEET_ID || !INVENTORY_TAB_NAME) {
  throw new Error('Missing required environment variables: GOOGLE_SHEETS_OKHLA_SHEET_ID, GOOGLE_SHEETS_BAHADURGARH_SHEET_ID, GOOGLE_SHEETS_INVENTORY_TAB_NAME');
}

/**
 * Create a background sync job
 * @param {Array} transactionIds - Array of transaction IDs to sync
 * @param {String} location - Location ('Okhla' or 'Bahadurgarh')
 * @returns {String} Job ID
 */
function createSyncJob(transactionIds, location) {
  const jobId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  activeJobs.set(jobId, {
    jobId,
    status: 'queued', // queued, processing, completed, failed
    progress: {
      total: transactionIds.length,
      processed: 0,
      successful: 0,
      failed: 0,
      retrying: 0
    },
    transactionIds,
    location,
    results: [],
    errors: [],
    startTime: Date.now(),
    endTime: null,
    createdAt: new Date()
  });
  
  // Start processing in background (non-blocking)
  processSyncJob(jobId).catch(error => {
    console.error(`[backgroundSyncService] Error processing job ${jobId}:`, error);
    const job = activeJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.endTime = Date.now();
      job.errors.push({
        message: error.message,
        timestamp: new Date()
      });
    }
  });
  
  return jobId;
}

/**
 * Process a sync job in the background
 * @param {String} jobId - Job ID
 */
async function processSyncJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  try {
    job.status = 'processing';
    
    // Fetch transactions from database
    const transactions = await InventoryTransaction.find({
      _id: { $in: job.transactionIds }
    });
    
    if (transactions.length === 0) {
      job.status = 'completed';
      job.endTime = Date.now();
      return;
    }
    
    const spreadsheetId = job.location === 'Okhla' ? OKHLA_SPREADSHEET_ID : BAHADURGARH_SPREADSHEET_ID;
    const sheetName = INVENTORY_TAB_NAME;
    
    // Prepare batch update data
    const batchUpdates = [];
    
    for (const transaction of transactions) {
      for (const item of transaction.items || []) {
        if (!item.sku || !item.quantity) continue;
        
        batchUpdates.push({
          spreadsheetId,
          sheetName,
          sku: item.sku,
          transactionType: transaction.transactionType,
          date: transaction.transactionDate,
          quantity: item.quantity,
          mode: 'sum',
          orderId: transaction.orderId || transaction._id.toString(),
          orderName: transaction.orderName || `Transaction ${transaction._id}`
        });
      }
    }
    
    // Process in batches with retry logic
    const batchSize = 50; // Process 50 updates at a time
    const failedUpdates = [];
    
    for (let i = 0; i < batchUpdates.length; i += batchSize) {
      const batch = batchUpdates.slice(i, i + batchSize);
      
      try {
        // Use retry with backoff for each batch
        const results = await retryWithBackoff(
          async () => {
            return await batchUpdateInventoryTransactions(batch);
          },
          {
            maxRetries: 5,
            initialDelayMs: 2000, // Start with 2 seconds
            maxDelayMs: 60000, // Max 60 seconds
            onRetry: (attempt, maxRetries, delay) => {
              console.log(`[backgroundSyncService] Job ${jobId}: Retrying batch ${Math.floor(i / batchSize) + 1} (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
              job.progress.retrying = attempt;
            }
          }
        );
        
        // Mark successful updates
        const successfulSkus = results
          .filter(r => !r.error)
          .map(r => r.sku);
        
        job.progress.processed += batch.length;
        job.progress.successful += successfulSkus.length;
        
        // Track failed updates for retry
        results.forEach((result, idx) => {
          if (result.error && isRateLimitError({ message: result.error })) {
            failedUpdates.push(batch[idx]);
          } else if (result.error) {
            job.errors.push({
              sku: result.sku,
              error: result.error,
              timestamp: new Date()
            });
            job.progress.failed++;
          } else {
            job.results.push(result);
          }
        });
        
      } catch (error) {
        // If retry failed, mark all in batch as failed
        console.error(`[backgroundSyncService] Job ${jobId}: Batch failed after retries:`, error.message);
        
        batch.forEach(update => {
          job.errors.push({
            sku: update.sku,
            error: error.message,
            timestamp: new Date()
          });
          failedUpdates.push(update);
        });
        
        job.progress.processed += batch.length;
        job.progress.failed += batch.length;
      }
    }
    
    // Retry failed updates (due to rate limits) in a separate loop
    if (failedUpdates.length > 0) {
      console.log(`[backgroundSyncService] Job ${jobId}: Retrying ${failedUpdates.length} failed updates`);
      
      // Wait before retrying failed updates
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      // Retry failed updates with longer delays
      const retryBatchSize = 10; // Smaller batches for retries
      
      for (let i = 0; i < failedUpdates.length; i += retryBatchSize) {
        const retryBatch = failedUpdates.slice(i, i + retryBatchSize);
        
        try {
          const retryResults = await retryWithBackoff(
            async () => {
              return await batchUpdateInventoryTransactions(retryBatch);
            },
            {
              maxRetries: 10, // More retries for failed items
              initialDelayMs: 5000, // Start with 5 seconds
              maxDelayMs: 120000, // Max 2 minutes
              onRetry: (attempt, maxRetries, delay) => {
                console.log(`[backgroundSyncService] Job ${jobId}: Retrying failed batch (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
              }
            }
          );
          
          retryResults.forEach(result => {
            if (result.error) {
              job.errors.push({
                sku: result.sku,
                error: result.error,
                timestamp: new Date()
              });
              job.progress.failed++;
            } else {
              job.results.push(result);
              job.progress.successful++;
            }
          });
          
          job.progress.processed += retryBatch.length;
          
          // Wait between retry batches to avoid rate limits
          if (i + retryBatchSize < failedUpdates.length) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
        } catch (error) {
          console.error(`[backgroundSyncService] Job ${jobId}: Retry batch failed:`, error.message);
          retryBatch.forEach(update => {
            job.errors.push({
              sku: update.sku,
              error: `Final retry failed: ${error.message}`,
              timestamp: new Date()
            });
            job.progress.failed++;
          });
        }
      }
    }
    
    // Mark transactions as synced if at least one item succeeded
    const successfulTransactionIds = new Set();
    job.results.forEach(result => {
      if (result.transactionId) {
        successfulTransactionIds.add(result.transactionId);
      }
    });
    
    // Update database
    if (successfulTransactionIds.size > 0) {
      await InventoryTransaction.updateMany(
        { _id: { $in: Array.from(successfulTransactionIds) } },
        { 
          $set: { 
            syncedToSheets: true,
            sheetsSyncDate: new Date()
          } 
        }
      );
    }
    
    job.status = 'completed';
    job.endTime = Date.now();
    
    console.log(`[backgroundSyncService] Job ${jobId} completed: ${job.progress.successful} successful, ${job.progress.failed} failed`);
    
  } catch (error) {
    console.error(`[backgroundSyncService] Job ${jobId} failed:`, error);
    job.status = 'failed';
    job.endTime = Date.now();
    job.errors.push({
      message: error.message,
      timestamp: new Date()
    });
    throw error;
  }
}

/**
 * Get job status and progress
 * @param {String} jobId - Job ID
 * @returns {Object|null} Job status or null if not found
 */
function getJobStatus(jobId) {
  return activeJobs.get(jobId) || null;
}

/**
 * Get all active jobs
 * @returns {Array} Array of job statuses
 */
function getAllJobs() {
  return Array.from(activeJobs.values());
}

/**
 * Clean up old completed jobs (keep last 100)
 */
function cleanupOldJobs() {
  const jobs = Array.from(activeJobs.values());
  const completedJobs = jobs
    .filter(job => job.status === 'completed' || job.status === 'failed')
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
  
  // Keep last 100 completed jobs
  if (completedJobs.length > 100) {
    const toRemove = completedJobs.slice(100);
    toRemove.forEach(job => {
      activeJobs.delete(job.jobId);
    });
  }
}

// Clean up old jobs every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

module.exports = {
  createSyncJob,
  getJobStatus,
  getAllJobs,
  processSyncJob
};

