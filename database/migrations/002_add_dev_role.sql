-- Migration: Add 'dev' role to users table
-- This migration updates the role ENUM to include 'dev' role

-- Alter the users table to add 'dev' to the role ENUM
ALTER TABLE users MODIFY COLUMN role ENUM('user', 'admin', 'dev') NOT NULL DEFAULT 'user';

-- Note: Existing users will remain unchanged, only the allowed values are expanded

