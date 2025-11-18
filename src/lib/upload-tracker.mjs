/**
 * Upload Tracking System for MeddeyGo Workspace
 * Tracks temporary file uploads and performs automatic cleanup after 7 days
 * Uses MongoDB (shared with Inventory Management)
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

// SECURITY: Require MongoDB URI from environment, no hardcoded fallback
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[Upload Tracker] ERROR: MONGODB_URI not configured');
  console.error('[Upload Tracker] Please set MONGODB_URI in project-hub/.env');
  console.error('[Upload Tracker] Upload tracking features will not work');
}
const DB_NAME = 'meddeygo-workspace';
const UPLOADS_COLLECTION = 'temporary_uploads';
const CLEANUP_LOG_COLLECTION = 'upload_cleanup_log';

let client = null;
let db = null;

/**
 * Get MongoDB database connection
 */
async function getDatabase() {
  if (!db) {
    try {
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is required for upload tracking');
      }
      client = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      });
      
      await client.connect();
      db = client.db(DB_NAME);
      
      // Create indexes for better performance
      await db.collection(UPLOADS_COLLECTION).createIndex({ expiry_timestamp: 1 });
      await db.collection(UPLOADS_COLLECTION).createIndex({ tool_name: 1 });
      await db.collection(UPLOADS_COLLECTION).createIndex({ is_deleted: 1 });
      
      console.log('✓ MongoDB upload tracker connected successfully');
    } catch (error) {
      console.error('✗ Failed to connect to MongoDB:', error);
      throw error;
    }
  }
  return db;
}

/**
 * Initialize database (ensure collections exist)
 */
export async function initializeDatabase() {
  try {
    const database = await getDatabase();
    
    // Collections are created automatically in MongoDB
    // Just verify they exist
    const collections = await database.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes(UPLOADS_COLLECTION)) {
      await database.createCollection(UPLOADS_COLLECTION);
      console.log(`✓ Created collection: ${UPLOADS_COLLECTION}`);
    }
    
    if (!collectionNames.includes(CLEANUP_LOG_COLLECTION)) {
      await database.createCollection(CLEANUP_LOG_COLLECTION);
      console.log(`✓ Created collection: ${CLEANUP_LOG_COLLECTION}`);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Track a new uploaded file
 * @param {string} filePath - Full path to uploaded file
 * @param {string} fileName - Original filename
 * @param {number} fileSize - File size in bytes
 * @param {string} toolName - Name of the tool that created the upload
 */
export async function trackUpload(filePath, fileName, fileSize, toolName) {
  try {
    const database = await getDatabase();
    const collection = database.collection(UPLOADS_COLLECTION);
    
    const uploadTimestamp = new Date();
    const expiryTimestamp = new Date();
    expiryTimestamp.setDate(expiryTimestamp.getDate() + 7); // 7 days from now
    
    const document = {
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      tool_name: toolName,
      upload_timestamp: uploadTimestamp,
      expiry_timestamp: expiryTimestamp,
      is_deleted: false,
      deleted_at: null
    };
    
    const result = await collection.insertOne(document);
    
    console.log(`✓ Tracked upload: ${fileName} from ${toolName} (expires in 7 days)`);
    return result.insertedId;
  } catch (error) {
    console.error('Failed to track upload:', error);
    throw error;
  }
}

/**
 * Get all expired uploads (older than 7 days and not yet deleted)
 */
export async function getExpiredUploads() {
  try {
    const database = await getDatabase();
    const collection = database.collection(UPLOADS_COLLECTION);
    
    const now = new Date();
    
    const expiredFiles = await collection.find({
      expiry_timestamp: { $lte: now },
      is_deleted: false
    }).toArray();
    
    return expiredFiles;
  } catch (error) {
    console.error('Failed to get expired uploads:', error);
    throw error;
  }
}

/**
 * Mark upload as deleted
 */
async function markAsDeleted(uploadId) {
  try {
    const database = await getDatabase();
    const collection = database.collection(UPLOADS_COLLECTION);
    
    await collection.updateOne(
      { _id: uploadId },
      {
        $set: {
          is_deleted: true,
          deleted_at: new Date()
        }
      }
    );
  } catch (error) {
    console.error('Failed to mark upload as deleted:', error);
    throw error;
  }
}

/**
 * Log cleanup operation
 */
async function logCleanup(toolName, filesDeleted, spaceFreedBytes, errorMessage = null) {
  try {
    const database = await getDatabase();
    const collection = database.collection(CLEANUP_LOG_COLLECTION);
    
    const logEntry = {
      cleanup_timestamp: new Date(),
      tool_name: toolName,
      files_deleted: filesDeleted,
      space_freed_mb: (spaceFreedBytes / 1024 / 1024).toFixed(2),
      error_message: errorMessage
    };
    
    await collection.insertOne(logEntry);
  } catch (error) {
    console.error('Failed to log cleanup:', error);
  }
}

/**
 * Perform cleanup of expired uploads
 * Deletes files from disk and updates database
 */
export async function performCleanup() {
  try {
    console.log('🧹 Starting upload cleanup...');
    
    await initializeDatabase();
    const expiredUploads = await getExpiredUploads();
    
    if (expiredUploads.length === 0) {
      console.log('✓ No expired uploads to clean');
      return {
        success: true,
        filesDeleted: 0,
        spaceFreed: 0,
        errors: []
      };
    }
    
    console.log(`Found ${expiredUploads.length} expired upload(s) to clean`);
    
    let filesDeleted = 0;
    let spaceFreed = 0;
    const errors = [];
    const toolStats = {};
    
    for (const upload of expiredUploads) {
      try {
        // Check if file exists
        if (fs.existsSync(upload.file_path)) {
          // Delete the file
          await fs.promises.unlink(upload.file_path);
          filesDeleted++;
          spaceFreed += upload.file_size;
          
          // Update tool stats
          if (!toolStats[upload.tool_name]) {
            toolStats[upload.tool_name] = { count: 0, size: 0 };
          }
          toolStats[upload.tool_name].count++;
          toolStats[upload.tool_name].size += upload.file_size;
          
          console.log(`✓ Deleted: ${upload.file_name} (${(upload.file_size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
          console.log(`⚠ File already deleted: ${upload.file_name}`);
        }
        
        // Mark as deleted in database
        await markAsDeleted(upload._id);
        
      } catch (error) {
        console.error(`✗ Failed to delete ${upload.file_name}:`, error.message);
        errors.push({
          file: upload.file_name,
          error: error.message
        });
      }
    }
    
    // Log cleanup for each tool
    for (const [toolName, stats] of Object.entries(toolStats)) {
      await logCleanup(toolName, stats.count, stats.size);
    }
    
    // Summary
    const spaceFreeStrMB = (spaceFreed / 1024 / 1024).toFixed(2);
    console.log('\n📊 Cleanup Summary:');
    console.log(`   Files deleted: ${filesDeleted}`);
    console.log(`   Space freed: ${spaceFreeStrMB} MB`);
    
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
    }
    
    return {
      success: true,
      filesDeleted,
      spaceFreed,
      errors
    };
    
  } catch (error) {
    console.error('Cleanup failed:', error);
    return {
      success: false,
      filesDeleted: 0,
      spaceFreed: 0,
      errors: [{ error: error.message }]
    };
  }
}

/**
 * Get cleanup statistics
 */
export async function getCleanupStats() {
  try {
    const database = await getDatabase();
    const uploadsCollection = database.collection(UPLOADS_COLLECTION);
    const logsCollection = database.collection(CLEANUP_LOG_COLLECTION);
    
    // Total uploads tracked
    const totalUploads = await uploadsCollection.countDocuments();
    
    // Active uploads (not deleted)
    const activeUploads = await uploadsCollection.countDocuments({ is_deleted: false });
    
    // Deleted uploads
    const deletedUploads = await uploadsCollection.countDocuments({ is_deleted: true });
    
    // Pending cleanup (expired but not deleted)
    const pendingCleanup = await uploadsCollection.countDocuments({
      expiry_timestamp: { $lte: new Date() },
      is_deleted: false
    });
    
    // Recent cleanup logs (last 10)
    const recentCleanups = await logsCollection
      .find()
      .sort({ cleanup_timestamp: -1 })
      .limit(10)
      .toArray();
    
    // Per-tool statistics
    const toolStats = await uploadsCollection.aggregate([
      {
        $group: {
          _id: '$tool_name',
          total_files: { $sum: 1 },
          total_size: { $sum: '$file_size' },
          active_files: {
            $sum: { $cond: [{ $eq: ['$is_deleted', false] }, 1, 0] }
          }
        }
      }
    ]).toArray();
    
    return {
      totalUploads,
      activeUploads,
      deletedUploads,
      pendingCleanup,
      recentCleanups,
      toolStats
    };
  } catch (error) {
    console.error('Failed to get cleanup stats:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closeConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('✓ MongoDB connection closed');
  }
}

// Export for use in other modules
const uploadTracker = {
  initializeDatabase,
  trackUpload,
  getExpiredUploads,
  performCleanup,
  getCleanupStats,
  closeConnection
};

export default uploadTracker;
