-- Application Login Settings Table
-- Stores configuration for which applications use their own login vs project-hub login

CREATE TABLE IF NOT EXISTS application_login_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tool_slug VARCHAR(100) NOT NULL UNIQUE,
  tool_name VARCHAR(255) NOT NULL,
  use_own_login BOOLEAN NOT NULL DEFAULT FALSE,
  login_url VARCHAR(500) NULL,
  logout_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tool_slug (tool_slug),
  INDEX idx_use_own_login (use_own_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings for all tools (all use project-hub login by default)
INSERT IGNORE INTO application_login_settings (tool_slug, tool_name, use_own_login) VALUES
  ('quote-generator', 'Quote Generator', FALSE),
  ('order-extractor', 'Order ID Extractor', FALSE),
  ('inventory-management', 'Inventory Management', FALSE),
  ('gsheet-integration', 'Google Sheets Integration', FALSE),
  ('data-extractor-pro', 'Data Extractor Pro', FALSE),
  ('file-merger', 'File Merger', FALSE);

