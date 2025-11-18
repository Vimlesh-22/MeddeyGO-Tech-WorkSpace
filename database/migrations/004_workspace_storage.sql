-- Workspace Storage Migration
-- This schema provides centralized storage for all tools' files, jobs, and logs
-- Replaces local filesystem storage with MariaDB-backed storage

-- Table: tool_jobs
-- Tracks processing jobs for all tools (Data Extractor, File Merger, Order Extractor, etc.)
CREATE TABLE IF NOT EXISTS tool_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_slug VARCHAR(100) NOT NULL COMMENT 'Tool identifier (data-extractor-pro, file-merger, etc.)',
  job_id VARCHAR(255) NOT NULL UNIQUE COMMENT 'Unique job identifier (UUID)',
  user_id INT NULL COMMENT 'User who initiated the job (optional)',
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  job_type VARCHAR(100) NOT NULL COMMENT 'Job type (upload, merge, extract, etc.)',
  job_config JSON NULL COMMENT 'Job configuration and parameters',
  input_files JSON NULL COMMENT 'Array of input file references',
  output_files JSON NULL COMMENT 'Array of output file references',
  error_message TEXT NULL COMMENT 'Error message if job failed',
  metadata JSON NULL COMMENT 'Additional job metadata',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_tool_slug (tool_slug),
  INDEX idx_job_id (job_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tool_files
-- Stores file metadata and binary data for all tools
CREATE TABLE IF NOT EXISTS tool_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_slug VARCHAR(100) NOT NULL COMMENT 'Tool identifier',
  job_id VARCHAR(255) NULL COMMENT 'Associated job ID',
  file_type ENUM('upload', 'output', 'temp', 'export', 'log') NOT NULL COMMENT 'File type',
  file_name VARCHAR(500) NOT NULL COMMENT 'Original filename',
  file_path VARCHAR(1000) NULL COMMENT 'Original file path (for migration reference)',
  file_size BIGINT NOT NULL COMMENT 'File size in bytes',
  mime_type VARCHAR(255) NULL COMMENT 'MIME type',
  file_data LONGBLOB NULL COMMENT 'File binary data (for small files)',
  storage_type ENUM('database', 'external', 'stream') NOT NULL DEFAULT 'database' COMMENT 'Storage location',
  storage_path VARCHAR(1000) NULL COMMENT 'External storage path (if not in DB)',
  checksum VARCHAR(64) NULL COMMENT 'File checksum (SHA-256)',
  expires_at TIMESTAMP NULL COMMENT 'Expiration time for temp files',
  metadata JSON NULL COMMENT 'Additional file metadata',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tool_slug (tool_slug),
  INDEX idx_job_id (job_id),
  INDEX idx_file_type (file_type),
  INDEX idx_expires_at (expires_at),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (job_id) REFERENCES tool_jobs(job_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tool_logs
-- Centralized logging for all tools
CREATE TABLE IF NOT EXISTS tool_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_slug VARCHAR(100) NOT NULL COMMENT 'Tool identifier',
  job_id VARCHAR(255) NULL COMMENT 'Associated job ID',
  log_level ENUM('debug', 'info', 'warn', 'error', 'fatal') NOT NULL DEFAULT 'info',
  log_message TEXT NOT NULL COMMENT 'Log message',
  log_data JSON NULL COMMENT 'Additional log data',
  user_id INT NULL COMMENT 'User who triggered the log (optional)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tool_slug (tool_slug),
  INDEX idx_job_id (job_id),
  INDEX idx_log_level (log_level),
  INDEX idx_created_at (created_at),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tool_storage_stats
-- Tracks storage usage per tool
CREATE TABLE IF NOT EXISTS tool_storage_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_slug VARCHAR(100) NOT NULL UNIQUE COMMENT 'Tool identifier',
  total_files INT NOT NULL DEFAULT 0 COMMENT 'Total number of files',
  total_size BIGINT NOT NULL DEFAULT 0 COMMENT 'Total storage size in bytes',
  active_jobs INT NOT NULL DEFAULT 0 COMMENT 'Number of active jobs',
  last_cleanup TIMESTAMP NULL COMMENT 'Last cleanup timestamp',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tool_slug (tool_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

