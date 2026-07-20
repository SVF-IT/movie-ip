-- ============================================================
-- 29 — Re-add movies.poster_url
-- poster upload/link feature restored in the app (bulk + single upload + URL field)
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS poster_url TEXT;
