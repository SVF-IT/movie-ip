-- ============================================================
-- 30 — Add syndication_holdback to movies
-- Movie-wide, comma-separated list of platform/exploitation types that are
-- permanently restricted for this title (e.g. "AVOD, FVOD"), regardless of
-- what any individual platform_rights/movie_rights slot shows as available
-- ("Open"). Used to gate exploitation decisions independent of per-platform
-- rights state — a type listed here can never be exploited even if a slot
-- is otherwise open.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS syndication_holdback TEXT;
