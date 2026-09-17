-- ============================================================
-- Phase 2.11 — people.image_url
-- Headshot for each person, backfilled from TMDB via
-- /api/people-images/scan + /commit and re-hosted in the
-- existing public "images" storage bucket (see phase2_10).
-- Depends on: 02_people.sql
-- ============================================================

ALTER TABLE people
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN people.image_url IS
    'Public URL of the person''s headshot in the images bucket (people/ prefix). NULL when no photo has been found or uploaded.';
