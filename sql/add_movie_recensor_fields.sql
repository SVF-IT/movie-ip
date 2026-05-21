-- Migration: Add joint_prod_buy_back_date and recensor_flag to movies table
-- joint_prod_buy_back_date: null initially; set manually via script for jointly produced movies
-- recensor_flag: auto-set to true for movies with 'A' certification; admin can manually set to false

ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS joint_prod_buy_back_date DATE,
  ADD COLUMN IF NOT EXISTS recensor_flag BOOLEAN NOT NULL DEFAULT FALSE;

-- Set recensor_flag = true for all existing movies with 'A' certification
UPDATE movies
SET recensor_flag = TRUE
WHERE certification ILIKE 'A'
  AND recensor_flag = FALSE;

-- Index for quick lookup of movies needing recensor notifications
CREATE INDEX IF NOT EXISTS idx_movies_recensor_flag ON movies (recensor_flag)
WHERE recensor_flag = TRUE;

-- Seed notification_settings row for recensor_reminder (admin-only, enabled by default)
INSERT INTO notification_settings (notification_type, is_enabled, description, category, role_filters)
VALUES (
  'recensor_reminder',
  TRUE,
  'Monthly reminder for A-certified movies pending recensoring',
  'alerts',
  ARRAY['admin']
)
ON CONFLICT (notification_type) DO NOTHING;
