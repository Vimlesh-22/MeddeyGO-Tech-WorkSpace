-- Create missing tables for project hub

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

-- Surprise messages pool
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

-- Insert default surprise messages
INSERT INTO surprise_messages (message, tool_id, is_active) VALUES
('🎉 Welcome! Ready to boost your productivity?', NULL, 1),
('✨ Amazing things happen when you stay organized!', NULL, 1),
('🚀 You\'re doing great! Keep up the momentum!', NULL, 1),
('💡 Pro tip: Take breaks to stay sharp!', NULL, 1),
('🎯 Focus on progress, not perfection!', NULL, 1),
('⭐ You\'re making excellent progress today!', NULL, 1),
('🔥 Your workflow is getting smoother!', NULL, 1),
('💪 You\'ve got this! Power through!', NULL, 1),
('🌟 Small steps lead to big achievements!', NULL, 1),
('⚡ Ready to tackle your next challenge?', NULL, 1);

-- Insert tool-specific messages
INSERT INTO surprise_messages (message, tool_id, is_active) VALUES
('📊 Data extraction made simple and powerful!', 'data-extractor-pro', 1),
('📈 Transform your data into insights!', 'data-extractor-pro', 1),
('🔄 Seamless file merging at your fingertips!', 'file-merger', 1),
('📋 Combine files effortlessly!', 'file-merger', 1),
('📊 Google Sheets integration perfected!', 'gsheet-integration', 1),
('🔗 Connect your data like never before!', 'gsheet-integration', 1),
('📦 Inventory management simplified!', 'inventory-management', 1),
('📋 Track your stock with precision!', 'inventory-management', 1),
('📋 Order processing streamlined!', 'order-extractor', 1),
('📊 Extract orders efficiently!', 'order-extractor', 1),
('💰 Quote generation made easy!', 'quote-generator', 1),
('📈 Create professional quotes fast!', 'quote-generator', 1);