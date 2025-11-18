// Database schema for tracking temporary uploads
// This will be used by all tools to track and cleanup temporary files

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

// Load master .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10
};

// Create database connection pool
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Initialize uploads tracking table
async function initializeDatabase() {
  const connection = await getPool().getConnection();
  
  try {
    // Create temporary_uploads table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS temporary_uploads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(500) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        tool_name VARCHAR(100) NOT NULL,
        upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiry_timestamp TIMESTAMP DEFAULT (DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY)),
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP NULL,
        INDEX idx_expiry (expiry_timestamp),
        INDEX idx_tool (tool_name),
        INDEX idx_deleted (is_deleted)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✓ Temporary uploads table initialized');
    
    // Create cleanup log table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS upload_cleanup_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cleanup_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        files_deleted INT NOT NULL DEFAULT 0,
        space_freed_mb DECIMAL(10, 2) NOT NULL DEFAULT 0,
        tool_name VARCHAR(100),
        error_message TEXT NULL,
        INDEX idx_timestamp (cleanup_timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✓ Cleanup log table initialized');
    
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Track a new upload
async function trackUpload(filePath, fileName, fileSize, toolName) {
  const connection = await getPool().getConnection();
  
  try {
    await connection.query(
      `INSERT INTO temporary_uploads 
       (file_path, file_name, file_size, tool_name) 
       VALUES (?, ?, ?, ?)`,
      [filePath, fileName, fileSize, toolName]
    );
    
    console.log(`✓ Tracked upload: ${fileName} (${toolName})`);
  } catch (error) {
    console.error('Error tracking upload:', error);
  } finally {
    connection.release();
  }
}

// Get expired uploads
async function getExpiredUploads() {
  const connection = await getPool().getConnection();
  
  try {
    const [rows] = await connection.query(`
      SELECT * FROM temporary_uploads 
      WHERE expiry_timestamp <= NOW() 
      AND is_deleted = FALSE
      ORDER BY expiry_timestamp ASC
    `);
    
    return rows;
  } catch (error) {
    console.error('Error fetching expired uploads:', error);
    return [];
  } finally {
    connection.release();
  }
}

// Mark upload as deleted
async function markAsDeleted(uploadId) {
  const connection = await getPool().getConnection();
  
  try {
    await connection.query(
      `UPDATE temporary_uploads 
       SET is_deleted = TRUE, deleted_at = NOW() 
       WHERE id = ?`,
      [uploadId]
    );
  } catch (error) {
    console.error('Error marking upload as deleted:', error);
  } finally {
    connection.release();
  }
}

// Log cleanup operation
async function logCleanup(filesDeleted, spaceFree, toolName = null, errorMessage = null) {
  const connection = await getPool().getConnection();
  
  try {
    await connection.query(
      `INSERT INTO upload_cleanup_log 
       (files_deleted, space_freed_mb, tool_name, error_message) 
       VALUES (?, ?, ?, ?)`,
      [filesDeleted, spaceFree, toolName, errorMessage]
    );
  } catch (error) {
    console.error('Error logging cleanup:', error);
  } finally {
    connection.release();
  }
}

// Perform cleanup
async function performCleanup() {
  console.log('\n🧹 Starting upload cleanup...\n');
  
  const expiredUploads = await getExpiredUploads();
  
  if (expiredUploads.length === 0) {
    console.log('✓ No expired uploads to clean');
    await logCleanup(0, 0);
    return;
  }
  
  console.log(`Found ${expiredUploads.length} expired uploads`);
  
  let filesDeleted = 0;
  let spaceFree = 0;
  const toolStats = {};
  
  for (const upload of expiredUploads) {
    try {
      // Check if file exists
      await fs.access(upload.file_path);
      
      // Get file stats
      const stats = await fs.stat(upload.file_path);
      
      // Delete file
      await fs.unlink(upload.file_path);
      
      // Mark as deleted in database
      await markAsDeleted(upload.id);
      
      filesDeleted++;
      spaceFree += stats.size;
      
      // Track per-tool stats
      if (!toolStats[upload.tool_name]) {
        toolStats[upload.tool_name] = { count: 0, size: 0 };
      }
      toolStats[upload.tool_name].count++;
      toolStats[upload.tool_name].size += stats.size;
      
      console.log(`  ✓ Deleted: ${upload.file_name} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already deleted, just mark it
        await markAsDeleted(upload.id);
        console.log(`  ⚠ File not found (already deleted): ${upload.file_name}`);
      } else {
        console.error(`  ✗ Error deleting ${upload.file_name}:`, error.message);
      }
    }
  }
  
  const spaceFreeStrMB = (spaceFree / 1024 / 1024).toFixed(2);
  
  // Log cleanup
  await logCleanup(filesDeleted, spaceFreeStrMB);
  
  // Log per-tool stats
  for (const [toolName, stats] of Object.entries(toolStats)) {
    const toolSpaceMB = (stats.size / 1024 / 1024).toFixed(2);
    await logCleanup(stats.count, toolSpaceMB, toolName);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`✓ Cleanup complete`);
  console.log(`  Files deleted: ${filesDeleted}`);
  console.log(`  Space freed: ${spaceFreeStrMB} MB`);
  console.log('='.repeat(60) + '\n');
  
  // Show per-tool breakdown
  console.log('Per-tool breakdown:');
  for (const [toolName, stats] of Object.entries(toolStats)) {
    const toolSpaceMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ${toolName}: ${stats.count} files, ${toolSpaceMB} MB`);
  }
  console.log('');
}

// Get cleanup statistics
async function getCleanupStats() {
  const connection = await getPool().getConnection();
  
  try {
    // Total stats
    const [totalStats] = await connection.query(`
      SELECT 
        SUM(files_deleted) as total_files,
        SUM(space_freed_mb) as total_space_mb
      FROM upload_cleanup_log
    `);
    
    // Recent cleanups
    const [recentCleanups] = await connection.query(`
      SELECT * FROM upload_cleanup_log 
      ORDER BY cleanup_timestamp DESC 
      LIMIT 10
    `);
    
    // Current pending uploads
    const [pendingUploads] = await connection.query(`
      SELECT 
        tool_name,
        COUNT(*) as count,
        SUM(file_size) / 1024 / 1024 as size_mb
      FROM temporary_uploads 
      WHERE is_deleted = FALSE
      GROUP BY tool_name
    `);
    
    return {
      total: totalStats[0],
      recent: recentCleanups,
      pending: pendingUploads
    };
  } catch (error) {
    console.error('Error fetching cleanup stats:', error);
    return null;
  } finally {
    connection.release();
  }
}

module.exports = {
  initializeDatabase,
  trackUpload,
  getExpiredUploads,
  performCleanup,
  getCleanupStats,
  getPool
};
