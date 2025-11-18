-- Migration: Add attempt tracking to verification codes
-- This migration adds attempt_count and last_attempt_at columns to track OTP brute force attempts

ALTER TABLE verification_codes 
ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_locked ON verification_codes(locked_until);

