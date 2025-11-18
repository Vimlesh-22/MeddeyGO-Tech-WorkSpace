/**
 * Backup and Restore Utility
 * Automated backup and restore for MongoDB databases
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const execAsync = promisify(exec);

class BackupRestore {
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.join(process.cwd(), 'backups');
    this.mongoUri = options.mongoUri || process.env.MONGODB_URI;
    this.maxBackups = options.maxBackups || 7; // Keep last 7 backups
  }

  /**
   * Create a backup of the database
   * @param {string} dbName - Database name
   * @param {Object} options - Backup options
   * @returns {Promise<Object>} Backup result
   */
  async createBackup(dbName, options = {}) {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${dbName}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      logger.info('Starting database backup', {
        database: dbName,
        backupPath
      });

      // Use mongodump to create backup
      const command = `mongodump --uri="${this.mongoUri}" --db=${dbName} --out="${backupPath}"`;
      
      const { stdout, stderr } = await execAsync(command);

      if (stderr && !stderr.includes('done dumping')) {
        throw new Error(`Backup failed: ${stderr}`);
      }

      // Compress backup
      const compressCommand = `tar -czf "${backupPath}.tar.gz" -C "${this.backupDir}" "${backupName}"`;
      await execAsync(compressCommand);

      // Remove uncompressed backup
      await fs.rm(backupPath, { recursive: true, force: true });

      // Get backup size
      const stats = await fs.stat(`${backupPath}.tar.gz`);

      logger.info('Backup completed successfully', {
        database: dbName,
        backupFile: `${backupName}.tar.gz`,
        size: this.formatBytes(stats.size)
      });

      // Cleanup old backups
      await this.cleanupOldBackups();

      return {
        success: true,
        backupName: `${backupName}.tar.gz`,
        size: stats.size,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Backup failed', {
        database: dbName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restore database from backup
   * @param {string} backupName - Backup file name
   * @param {string} targetDb - Target database name
   * @returns {Promise<Object>} Restore result
   */
  async restoreBackup(backupName, targetDb) {
    try {
      const backupPath = path.join(this.backupDir, backupName);

      // Check if backup exists
      await fs.access(backupPath);

      logger.info('Starting database restore', {
        backupFile: backupName,
        targetDatabase: targetDb
      });

      // Extract backup
      const extractPath = path.join(this.backupDir, 'temp_restore');
      await fs.mkdir(extractPath, { recursive: true });

      const extractCommand = `tar -xzf "${backupPath}" -C "${extractPath}"`;
      await execAsync(extractCommand);

      // Find the database directory
      const files = await fs.readdir(extractPath);
      const dbDir = files[0]; // Should be the database name directory

      // Use mongorestore to restore backup
      const restoreCommand = `mongorestore --uri="${this.mongoUri}" --db=${targetDb} "${path.join(extractPath, dbDir)}" --drop`;
      
      const { stdout, stderr } = await execAsync(restoreCommand);

      if (stderr && !stderr.includes('done')) {
        throw new Error(`Restore failed: ${stderr}`);
      }

      // Cleanup temp directory
      await fs.rm(extractPath, { recursive: true, force: true });

      logger.info('Restore completed successfully', {
        backupFile: backupName,
        targetDatabase: targetDb
      });

      return {
        success: true,
        restoredFrom: backupName,
        targetDatabase: targetDb,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Restore failed', {
        backupFile: backupName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List available backups
   * @returns {Promise<Array>} List of backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.tar.gz')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          
          backups.push({
            name: file,
            size: stats.size,
            sizeFormatted: this.formatBytes(stats.size),
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      logger.error('Failed to list backups', { error: error.message });
      return [];
    }
  }

  /**
   * Delete old backups beyond maxBackups limit
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();

      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);

        for (const backup of toDelete) {
          const filePath = path.join(this.backupDir, backup.name);
          await fs.unlink(filePath);
          
          logger.info('Deleted old backup', {
            backup: backup.name,
            created: backup.created
          });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups', { error: error.message });
    }
  }

  /**
   * Schedule automatic backups
   * @param {string} dbName - Database name
   * @param {string} schedule - Cron-like schedule (e.g., '0 2 * * *' for 2 AM daily)
   * @param {number} interval - Interval in milliseconds
   */
  scheduleBackup(dbName, interval = 86400000) { // Default: 24 hours
    logger.info('Scheduling automatic backups', {
      database: dbName,
      interval: `${interval / 1000 / 60 / 60} hours`
    });

    // Run backup immediately
    this.createBackup(dbName).catch(err => {
      logger.error('Initial backup failed', { error: err.message });
    });

    // Schedule recurring backups
    setInterval(async () => {
      try {
        await this.createBackup(dbName);
      } catch (error) {
        logger.error('Scheduled backup failed', { error: error.message });
      }
    }, interval);
  }

  /**
   * Format bytes to human-readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = BackupRestore;