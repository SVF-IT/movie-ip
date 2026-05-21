-- ─── Approval Flow Migration ──────────────────────────────────────────────────
-- Adds approval_status to movies and a movie_approvals audit table.
-- All existing movies are backfilled as 'approved'.
-- Dashboard and movies_with_details views are updated to respect approval status.
-- Run this in the Supabase SQL editor.

-- ─── Step 1: Add approval_status column to movies ────────────────────────────
ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Backfill existing movies as approved
UPDATE movies SET approval_status = 'approved' WHERE approval_status = 'pending';

-- ─── Step 2: Create movie_approvals audit table ───────────────────────────────
CREATE TABLE IF NOT EXISTS movie_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id      UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reason        TEXT,           -- required when status = 'rejected'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-movie history lookup
CREATE INDEX IF NOT EXISTS idx_movie_approvals_movie_id ON movie_approvals(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_approvals_status   ON movie_approvals(status);

-- ─── Step 3: RLS on movie_approvals ──────────────────────────────────────────
ALTER TABLE movie_approvals ENABLE ROW LEVEL SECURITY;

-- Drop policies first so this script is safe to re-run
DROP POLICY IF EXISTS "approvals_read_all" ON movie_approvals;
DROP POLICY IF EXISTS "approvals_insert_legal_admin" ON movie_approvals;
DROP POLICY IF EXISTS "approvals_insert_authenticated" ON movie_approvals;

-- Everyone can read approvals
CREATE POLICY "approvals_read_all" ON movie_approvals
  FOR SELECT USING (true);

-- Any authenticated user can insert audit log entries
-- (role checks for approve/reject are enforced in the application layer)
CREATE POLICY "approvals_insert_authenticated" ON movie_approvals
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Step 4: Refresh movies_with_details to include approval_status ───────────
-- Drop dependent views first, then movies_with_details, to avoid column-rename errors.
DROP VIEW IF EXISTS expiring_rights CASCADE;
DROP VIEW IF EXISTS available_for_rights CASCADE;
DROP VIEW IF EXISTS dashboard_stats CASCADE;
DROP VIEW IF EXISTS movies_with_details CASCADE;

CREATE VIEW movies_with_details AS
SELECT
    m.*,
    (
        SELECT STRING_AGG(p.name, ', ' ORDER BY mp.billing_order NULLS LAST, p.name)
        FROM movie_people mp
        JOIN people p ON p.id = mp.person_id
        WHERE mp.movie_id = m.id AND mp.role = 'Actor'
    ) AS cast_names,
    (
        SELECT STRING_AGG(p.name, ', ' ORDER BY p.name)
        FROM movie_people mp
        JOIN people p ON p.id = mp.person_id
        WHERE mp.movie_id = m.id AND mp.role = 'Director'
    ) AS director_names
FROM movies m;

-- ─── Step 5: Recreate views dropped by CASCADE ───────────────────────────────
CREATE VIEW expiring_rights AS
SELECT
    pr.*,
    m.title  AS movie_title,
    m.source AS movie_source,
    p.name   AS platform_name,
    rt.name  AS rights_type_name,
    pr.end_date - CURRENT_DATE AS days_until_expiry
FROM platform_rights pr
JOIN movies m ON m.id = pr.movie_id
LEFT JOIN platforms p ON p.id = pr.platform_id
LEFT JOIN rights_types rt ON rt.id = pr.rights_type_id
WHERE pr.is_current = TRUE
  AND pr.end_date IS NOT NULL
  AND pr.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
  AND m.approval_status = 'approved';

CREATE VIEW available_for_rights AS
SELECT m.*
FROM movies m
WHERE NOT EXISTS (
    SELECT 1 FROM platform_rights pr
    WHERE pr.movie_id = m.id AND pr.is_current = TRUE
)
AND m.approval_status = 'approved';

-- ─── Step 6: Update dashboard_stats to count only approved movies ─────────────
CREATE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*)          FROM movies WHERE approval_status = 'approved')                                                AS total_movies,
    (SELECT COUNT(*)          FROM movies WHERE source = 'home_production' AND approval_status = 'approved')                AS home_productions,
    (SELECT COUNT(*)          FROM movies WHERE source = 'acquired'         AND approval_status = 'approved')               AS acquired_movies,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Actor'   AND m.approval_status = 'approved') AS total_actors,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Director' AND m.approval_status = 'approved') AS total_directors,
    (SELECT COUNT(*)          FROM platform_rights pr JOIN movies m ON m.id = pr.movie_id WHERE pr.is_current = TRUE AND m.approval_status = 'approved') AS active_rights,
    (SELECT COUNT(*)          FROM expiring_rights WHERE days_until_expiry <= 30)  AS rights_expiring_30_days,
    (SELECT COUNT(*)          FROM expiring_rights WHERE days_until_expiry <= 90)  AS rights_expiring_90_days,
    (SELECT COUNT(*)          FROM movies WHERE approval_status = 'pending')       AS pending_approvals;

-- ─── Step 7: Verify ───────────────────────────────────────────────────────────
-- SELECT approval_status, COUNT(*) FROM movies GROUP BY approval_status;
-- SELECT * FROM movie_approvals LIMIT 5;
-- SELECT pending_approvals FROM dashboard_stats;
