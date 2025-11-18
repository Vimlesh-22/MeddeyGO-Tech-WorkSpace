-- Add 'dev' role to users table enum
-- This migration adds the 'dev' role option to the users.role column

ALTER TABLE users 
MODIFY COLUMN role ENUM('user', 'admin', 'dev') NOT NULL DEFAULT 'user';
