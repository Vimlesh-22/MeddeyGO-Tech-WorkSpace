const ProcessedOrderHistory = require('../models/ProcessedOrderHistory');

const RETENTION_DAYS = 150;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const RETENTION_SECONDS = Math.floor(RETENTION_MS / 1000);
const TTL_INDEX_NAME = 'processed_history_createdAt_ttl';

/**
 * Cleanup service for old processing history records ONLY
 * SAFETY: This function ONLY deletes ProcessedOrderHistory records
 * It does NOT touch Orders, Vendors, Products, or any other collection
 * Deletes only ProcessedOrderHistory records older than RETENTION_DAYS days
 */
const cleanupOldHistory = async () => {
  try {
    const cutoffDate = new Date(Date.now() - RETENTION_MS);
    cutoffDate.setHours(0, 0, 0, 0);
    
    // SAFETY: Only delete from ProcessedOrderHistory collection
    // Explicitly targeting only the ProcessedOrderHistory model
    const query = {
      createdAt: { $lt: cutoffDate }
    };
    
    // Get count before deletion for logging
    const countBefore = await ProcessedOrderHistory.countDocuments(query);
    
    // Delete only ProcessedOrderHistory records older than retention period
    const result = await ProcessedOrderHistory.deleteMany(query);
    
    console.log(`[History Cleanup] Cleaned ProcessedOrderHistory only: Deleted ${result.deletedCount} records (of ${countBefore} found) older than ${RETENTION_DAYS} days (cutoff: ${cutoffDate.toISOString()})`);
    
    // Verify deletion count matches expected count
    if (result.deletedCount > countBefore) {
      console.warn('[History Cleanup] Warning: Deleted count exceeds expected count - unexpected behavior detected');
    }
    
    return {
      success: true,
      deletedCount: result.deletedCount,
      cutoffDate,
      retentionDays: RETENTION_DAYS,
      collection: 'ProcessedOrderHistory' // Explicit confirmation
    };
  } catch (error) {
    console.error('[History Cleanup] Error cleaning up ProcessedOrderHistory:', error);
    return {
      success: false,
      error: error.message,
      collection: 'ProcessedOrderHistory' // Explicit confirmation
    };
  }
};

/**
 * Get statistics about history records
 */
const getHistoryStats = async () => {
  try {
    const totalCount = await ProcessedOrderHistory.countDocuments();
    const cutoffDate = new Date(Date.now() - RETENTION_MS);
    cutoffDate.setHours(0, 0, 0, 0);
    const oldCount = await ProcessedOrderHistory.countDocuments({
      createdAt: { $lt: cutoffDate }
    });
    
    return {
      totalRecords: totalCount,
      oldRecords: oldCount,
      cutoffDate,
      retentionDays: RETENTION_DAYS
    };
  } catch (error) {
    console.error('[History Cleanup] Error getting history stats:', error);
    return null;
  }
};

const ensureHistoryTtlIndex = async () => {
  try {
    if (!ProcessedOrderHistory?.collection) {
      console.log('[History Cleanup] Collection not available yet, skipping TTL index creation');
      return;
    }
    
    const indexes = await ProcessedOrderHistory.collection.indexes();
    
    // Check if TTL index already exists with correct settings
    const existingTtlIndex = indexes.find(
      (idx) =>
        idx.name === TTL_INDEX_NAME ||
        (idx.key && idx.key.createdAt === 1 && typeof idx.expireAfterSeconds === 'number')
    );
    
    // If TTL index exists with correct expiration, we're good
    if (existingTtlIndex && existingTtlIndex.expireAfterSeconds === RETENTION_SECONDS) {
      console.log(`[History Cleanup] TTL index already exists with correct settings (${RETENTION_DAYS} days)`);
      return;
    }
    
    // If there's an existing index with different name but same key, drop it first
    if (existingTtlIndex && existingTtlIndex.name !== TTL_INDEX_NAME) {
      try {
        await ProcessedOrderHistory.collection.dropIndex(existingTtlIndex.name);
        console.log(`[History Cleanup] Dropped old index: ${existingTtlIndex.name}`);
      } catch (dropError) {
        // If drop fails (index might not exist), continue anyway
        console.log(`[History Cleanup] Could not drop old index ${existingTtlIndex.name}, continuing...`);
      }
    }
    
    // Create the TTL index with correct name and settings
    try {
      await ProcessedOrderHistory.collection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: RETENTION_SECONDS, name: TTL_INDEX_NAME }
      );
      console.log(`[History Cleanup] TTL index created successfully at ${RETENTION_DAYS} days`);
    } catch (createError) {
      // If create fails because index already exists with different name, that's okay
      if (createError.code === 85 || createError.message?.includes('equivalent index')) {
        console.log(`[History Cleanup] TTL index already exists (equivalent index found), skipping creation`);
      } else {
        throw createError;
      }
    }
  } catch (error) {
    // Log but don't fail - TTL index is nice to have but not critical
    if (error.message?.includes('equivalent index')) {
      console.log(`[History Cleanup] TTL index equivalent already exists, using existing index`);
    } else {
      console.error('[History Cleanup] Failed to ensure TTL index:', error.message || error);
    }
  }
};

module.exports = {
  cleanupOldHistory,
  getHistoryStats,
  ensureHistoryTtlIndex,
  RETENTION_DAYS
};
