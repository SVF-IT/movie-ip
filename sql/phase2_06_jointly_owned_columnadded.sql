-- ============================================================
-- 27 — Phase 2 app schema changes
-- Adds jointly_owned boolean column to movies table.
-- Must be run BEFORE phase2_05_drop_extra_movies_columns.sql.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS jointly_owned BOOLEAN NOT NULL DEFAULT FALSE;
