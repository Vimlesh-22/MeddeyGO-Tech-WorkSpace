/**
 * Centralized Storage Service
 * 
 * Provides MariaDB-backed storage for all tools, replacing local filesystem storage.
 * Supports file storage, job tracking, and centralized logging.
 */

import { getDbPool } from '@/lib/db';
import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import { Readable } from 'stream';

export type ToolSlug = 
  | 'quote-generator' 
  | 'order-extractor' 
  | 'inventory-management' 
  | 'data-extractor-pro' 
  | 'file-merger' 
  | 'gsheet-integration';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type FileType = 'upload' | 'output' | 'temp' | 'export' | 'log';
export type StorageType = 'database' | 'external' | 'stream';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface JobConfig {
  toolSlug: ToolSlug;
  jobType: string;
  userId?: number;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FileMetadata {
  toolSlug: ToolSlug;
  jobId?: string;
  fileType: FileType;
  fileName: string;
  filePath?: string;
  fileSize: number;
  mimeType?: string;
  storageType?: StorageType;
  storagePath?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  toolSlug: ToolSlug;
  jobId?: string;
  logLevel: LogLevel;
  logMessage: string;
  logData?: Record<string, unknown>;
  userId?: number;
}

/**
 * Create a new job
 */
export async function createJob(config: JobConfig): Promise<string> {
  const pool = getDbPool();
  const jobId = crypto.randomUUID();
  
  await pool.query<ResultSetHeader>(
    `INSERT INTO tool_jobs (tool_slug, job_id, user_id, job_type, job_config, metadata, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      config.toolSlug,
      jobId,
      config.userId || null,
      config.jobType,
      config.config ? JSON.stringify(config.config) : null,
      config.metadata ? JSON.stringify(config.metadata) : null,
    ]
  );
  
  return jobId;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  errorMessage?: string,
  outputFiles?: string[]
): Promise<void> {
  const pool = getDbPool();
  
  const updates: string[] = ['status = ?'];
  const values: (string | number | null)[] = [status];
  
  if (errorMessage) {
    updates.push('error_message = ?');
    values.push(errorMessage);
  }
  
  if (outputFiles) {
    updates.push('output_files = ?');
    values.push(JSON.stringify(outputFiles));
  }
  
  if (status === 'completed' || status === 'failed') {
    updates.push('completed_at = NOW()');
  }
  
  values.push(jobId);
  
  await pool.query<ResultSetHeader>(
    `UPDATE tool_jobs SET ${updates.join(', ')} WHERE job_id = ?`,
    values
  );
}

/**
 * Store a file in the database
 */
export async function storeFile(
  metadata: FileMetadata,
  fileData?: Buffer | Readable
): Promise<number> {
  const pool = getDbPool();
  
  // Calculate checksum if file data provided
  let checksum: string | null = null;
  let dataToStore: Buffer | null = null;
  
  if (fileData) {
    if (Buffer.isBuffer(fileData)) {
      dataToStore = fileData;
      checksum = crypto.createHash('sha256').update(fileData).digest('hex');
    } else {
      // For streams, we'd need to read it first (or use external storage)
      // For now, assume external storage for streams
      metadata.storageType = 'external';
    }
  }
  
  // For large files (>10MB), use external storage
  const MAX_DB_SIZE = 10 * 1024 * 1024; // 10MB
  if (dataToStore && dataToStore.length > MAX_DB_SIZE) {
    metadata.storageType = 'external';
    // In production, upload to object storage and set storagePath
    dataToStore = null;
  }
  
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tool_files 
     (tool_slug, job_id, file_type, file_name, file_path, file_size, mime_type, 
      file_data, storage_type, storage_path, checksum, expires_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      metadata.toolSlug,
      metadata.jobId || null,
      metadata.fileType,
      metadata.fileName,
      metadata.filePath || null,
      metadata.fileSize,
      metadata.mimeType || null,
      dataToStore,
      metadata.storageType || 'database',
      metadata.storagePath || null,
      checksum,
      metadata.expiresAt || null,
      metadata.metadata ? JSON.stringify(metadata.metadata) : null,
    ]
  );
  
  return result.insertId;
}

/**
 * Retrieve a file from storage
 */
export async function getFile(fileId: number): Promise<{
  id: number;
  toolSlug: string;
  jobId: string | null;
  fileType: FileType;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  fileData: Buffer | null;
  storageType: StorageType;
  storagePath: string | null;
  checksum: string | null;
  createdAt: Date;
} | null> {
  const pool = getDbPool();
  
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tool_slug, job_id, file_type, file_name, file_size, mime_type,
            file_data, storage_type, storage_path, checksum, created_at
     FROM tool_files WHERE id = ?`,
    [fileId]
  );
  
  if (rows.length === 0) {
    return null;
  }
  
  const row = rows[0];
  return {
    id: row.id,
    toolSlug: row.tool_slug,
    jobId: row.job_id,
    fileType: row.file_type,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    fileData: row.file_data ? Buffer.from(row.file_data) : null,
    storageType: row.storage_type,
    storagePath: row.storage_path,
    checksum: row.checksum,
    createdAt: row.created_at,
  };
}

/**
 * List files for a tool/job
 */
export async function listFiles(
  toolSlug: ToolSlug,
  jobId?: string,
  fileType?: FileType
): Promise<Array<{
  id: number;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: Date;
}>> {
  const pool = getDbPool();
  
  let query = `SELECT id, file_name, file_size, file_type, created_at
               FROM tool_files WHERE tool_slug = ?`;
  const params: (string | number)[] = [toolSlug];
  
  if (jobId) {
    query += ' AND job_id = ?';
    params.push(jobId);
  }
  
  if (fileType) {
    query += ' AND file_type = ?';
    params.push(fileType);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  
  return rows.map(row => ({
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    createdAt: row.created_at,
  }));
}

/**
 * Delete a file
 */
export async function deleteFile(fileId: number): Promise<boolean> {
  const pool = getDbPool();
  
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM tool_files WHERE id = ?',
    [fileId]
  );
  
  return result.affectedRows > 0;
}

/**
 * Log an entry
 */
export async function logEntry(entry: LogEntry): Promise<void> {
  const pool = getDbPool();
  
  await pool.query<ResultSetHeader>(
    `INSERT INTO tool_logs (tool_slug, job_id, log_level, log_message, log_data, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.toolSlug,
      entry.jobId || null,
      entry.logLevel,
      entry.logMessage,
      entry.logData ? JSON.stringify(entry.logData) : null,
      entry.userId || null,
    ]
  );
}

/**
 * Get logs for a tool/job
 */
export async function getLogs(
  toolSlug: ToolSlug,
  jobId?: string,
  logLevel?: LogLevel,
  limit: number = 100
): Promise<Array<{
  id: number;
  logLevel: LogLevel;
  logMessage: string;
  logData: unknown;
  createdAt: Date;
}>> {
  const pool = getDbPool();
  
  let query = `SELECT id, log_level, log_message, log_data, created_at
               FROM tool_logs WHERE tool_slug = ?`;
  const params: (string | number)[] = [toolSlug];
  
  if (jobId) {
    query += ' AND job_id = ?';
    params.push(jobId);
  }
  
  if (logLevel) {
    query += ' AND log_level = ?';
    params.push(logLevel);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  
  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  
  return rows.map(row => ({
    id: row.id,
    logLevel: row.log_level,
    logMessage: row.log_message,
    logData: row.log_data ? JSON.parse(row.log_data) : null,
    createdAt: row.created_at,
  }));
}

/**
 * Cleanup expired temporary files
 */
export async function cleanupExpiredFiles(toolSlug?: ToolSlug): Promise<number> {
  const pool = getDbPool();
  
  let query = 'DELETE FROM tool_files WHERE expires_at IS NOT NULL AND expires_at < NOW()';
  const params: string[] = [];
  
  if (toolSlug) {
    query += ' AND tool_slug = ?';
    params.push(toolSlug);
  }
  
  const [result] = await pool.query<ResultSetHeader>(query, params);
  
  return result.affectedRows;
}

/**
 * Get storage statistics for a tool
 */
export async function getStorageStats(toolSlug: ToolSlug): Promise<{
  totalFiles: number;
  totalSize: number;
  activeJobs: number;
}> {
  const pool = getDbPool();
  
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
       COUNT(*) as total_files,
       COALESCE(SUM(file_size), 0) as total_size,
       (SELECT COUNT(*) FROM tool_jobs WHERE tool_slug = ? AND status IN ('pending', 'processing')) as active_jobs
     FROM tool_files WHERE tool_slug = ?`,
    [toolSlug, toolSlug]
  );
  
  if (rows.length === 0) {
    return { totalFiles: 0, totalSize: 0, activeJobs: 0 };
  }
  
  return {
    totalFiles: rows[0].total_files,
    totalSize: rows[0].total_size,
    activeJobs: rows[0].active_jobs,
  };
}

