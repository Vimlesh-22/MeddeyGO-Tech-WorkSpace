-- Theme Preferences Table
-- Add this table to store user theme customizations

CREATE TABLE IF NOT EXISTS theme_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    theme_mode VARCHAR(20) DEFAULT 'light',
    bg_color VARCHAR(7),
    text_color VARCHAR(7),
    card_bg_color VARCHAR(7),
    border_color VARCHAR(7),
    primary_color VARCHAR(7),
    hover_color VARCHAR(7),
    muted_bg_color VARCHAR(7),
    muted_text_color VARCHAR(7),
    font_family VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_theme (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for faster lookups
CREATE INDEX idx_user_theme ON theme_preferences(user_id);
