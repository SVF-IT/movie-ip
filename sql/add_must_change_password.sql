-- Migration: Add must_change_password column to user_profiles table
-- This is used to force users to change their password on first login
-- Run this SQL in your Supabase SQL Editor

-- Add the must_change_password column with default value false
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Update existing users to not require password change
UPDATE user_profiles
SET must_change_password = FALSE
WHERE must_change_password IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.must_change_password IS 'When true, user must change password on next login. Set to true when admin creates account with temporary password.';
