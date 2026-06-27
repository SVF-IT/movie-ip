-- Migration 23: Add is_bangladeshi flag to movies
-- Marks movies that are Bangladeshi productions (acquired from Bangladesh).
-- The views.sql movies_with_details uses m.* so no view changes are needed.

ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS is_bangladeshi BOOLEAN NOT NULL DEFAULT FALSE;
