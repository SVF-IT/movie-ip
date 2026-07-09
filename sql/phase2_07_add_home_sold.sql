-- ============================================================
-- 28 — Add home_sold flag
-- Home-production-only flag: when true, the movie is treated as
-- sold/expired and surfaces in the Expired bucket on the movies list.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS home_sold BOOLEAN NOT NULL DEFAULT FALSE;
