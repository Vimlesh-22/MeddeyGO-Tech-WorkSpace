-- Migration: Create scheduling system tables
-- This migration creates tables for tool schedules, scheduled messages, scheduled banners, and tutorials

-- Tool schedules table
CREATE TABLE IF NOT EXISTS tool_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  open_at TIMESTAMP NOT NULL,
  close_at TIMESTAMP NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  surprise_message TEXT NULL,
  custom_message TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_tool_schedule (tool_id),
  INDEX idx_open_at (open_at),
  INDEX idx_close_at (close_at),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduled messages table (extends dev_messages with scheduling)
ALTER TABLE dev_messages 
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS scheduled_until TIMESTAMP NULL,
ADD INDEX idx_scheduled (scheduled_at, scheduled_until);

-- Scheduled banners table
CREATE TABLE IF NOT EXISTS scheduled_banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  target_role ENUM('user', 'admin', 'dev', 'all') NOT NULL DEFAULT 'all',
  scheduled_at TIMESTAMP NOT NULL,
  scheduled_until TIMESTAMP NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_scheduled (scheduled_at, scheduled_until),
  INDEX idx_target_role (target_role),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tool tutorials table
CREATE TABLE IF NOT EXISTS tool_tutorials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  video_file_path VARCHAR(500) NULL,
  video_file_url VARCHAR(500) NULL,
  video_file_size BIGINT NULL,
  video_mime_type VARCHAR(100) NULL,
  thumbnail_url VARCHAR(500) NULL,
  duration_seconds INT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tool (tool_id),
  INDEX idx_active (is_active),
  INDEX idx_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tutorial settings table
CREATE TABLE IF NOT EXISTS tutorial_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Surprise messages pool (for random messages on surprise cards)
CREATE TABLE IF NOT EXISTS surprise_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message TEXT NOT NULL,
  tool_id VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_tool (tool_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

