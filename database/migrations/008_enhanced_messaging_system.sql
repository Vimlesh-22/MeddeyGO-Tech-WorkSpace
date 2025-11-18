-- Enhanced developer messaging system with popup notifications
-- This migration adds fields for delivery method selection and enhanced notifications

-- Alter dev_messages table to add new fields
ALTER TABLE dev_messages 
ADD COLUMN IF NOT EXISTS delivery_method ENUM('in-app', 'email', 'both') NOT NULL DEFAULT 'in-app' AFTER expires_at,
ADD COLUMN IF NOT EXISTS priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' AFTER delivery_method,
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER priority,
ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) NULL AFTER image_url,
ADD COLUMN IF NOT EXISTS type ENUM('message', 'banner', 'video') NOT NULL DEFAULT 'message' AFTER video_url;

-- Alter user_messages table to add new fields for enhanced notifications
ALTER TABLE user_messages 
ADD COLUMN IF NOT EXISTS priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' AFTER content,
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER priority,
ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) NULL AFTER image_url,
ADD COLUMN IF NOT EXISTS type ENUM('message', 'banner', 'video') NOT NULL DEFAULT 'message' AFTER video_url,
ADD COLUMN IF NOT EXISTS dismissed TINYINT(1) NOT NULL DEFAULT 0 AFTER type,
ADD COLUMN IF NOT EXISTS dismissed_at DATETIME NULL AFTER dismissed,
ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL AFTER dismissed_at;

-- Create table for tracking dismissed notifications
CREATE TABLE IF NOT EXISTS user_message_dismissals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  message_id INT NOT NULL,
  dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_message_id (message_id),
  INDEX idx_dismissed_at (dismissed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES user_messages(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_message_dismissal (user_id, message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dev_messages_delivery_method ON dev_messages(delivery_method);
CREATE INDEX IF NOT EXISTS idx_dev_messages_priority ON dev_messages(priority);
CREATE INDEX IF NOT EXISTS idx_user_messages_dismissed ON user_messages(dismissed);
CREATE INDEX IF NOT EXISTS idx_user_messages_expires_at ON user_messages(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_messages_priority ON user_messages(priority);

-- Grant permissions for the new fields
GRANT SELECT, INSERT, UPDATE, DELETE ON dev_messages TO 'app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON user_messages TO 'app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON user_message_dismissals TO 'app_user'@'%';

-- Add comments for better documentation
ALTER TABLE dev_messages 
MODIFY delivery_method ENUM('in-app', 'email', 'both') NOT NULL DEFAULT 'in-app' COMMENT 'How the message should be delivered to users',
MODIFY priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' COMMENT 'Priority level of the message',
MODIFY image_url VARCHAR(500) NULL COMMENT 'URL for optional image attachment',
MODIFY video_url VARCHAR(500) NULL COMMENT 'URL for optional video attachment',
MODIFY type ENUM('message', 'banner', 'video') NOT NULL DEFAULT 'message' COMMENT 'Type of notification';

ALTER TABLE user_messages 
MODIFY priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium' COMMENT 'Priority level of the user notification',
MODIFY image_url VARCHAR(500) NULL COMMENT 'URL for optional image attachment',
MODIFY video_url VARCHAR(500) NULL COMMENT 'URL for optional video attachment',
MODIFY type ENUM('message', 'banner', 'video') NOT NULL DEFAULT 'message' COMMENT 'Type of notification',
MODIFY dismissed TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether the user has dismissed this notification',
MODIFY dismissed_at DATETIME NULL COMMENT 'When the user dismissed this notification',
MODIFY expires_at DATETIME NULL COMMENT 'When this notification expires';