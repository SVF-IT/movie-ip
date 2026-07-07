-- ============================================================
-- 28 — Drop extra movies columns no longer needed
-- Removes: nature_of_rights, territory, code, poster_url
--
-- nature_of_rights — home production "Sold" marker replaced by
--   jointly_exploitation_rights (text) and jointly_owned (boolean)
-- territory — movie-level territory replaced by per-right territory
--   in movie_rights.territory and platform_rights.territory
-- code — unused generated code field
-- poster_url — poster management removed from app
--
-- IMPORTANT: Run 27_phase2_app_changes.sql first (adds jointly_owned).
-- Safe to re-run (DROP COLUMN IF EXISTS throughout).
-- ============================================================

-- ── Drop views that reference movies.* ───────────────────────
DROP VIEW IF EXISTS dashboard_stats      CASCADE;
DROP VIEW IF EXISTS available_for_rights CASCADE;
DROP VIEW IF EXISTS expiring_rights      CASCADE;
DROP VIEW IF EXISTS movies_with_details  CASCADE;

-- ── Drop the columns ─────────────────────────────────────────
ALTER TABLE movies
    DROP COLUMN IF EXISTS nature_of_rights,
    DROP COLUMN IF EXISTS territory,
    DROP COLUMN IF EXISTS code,
    DROP COLUMN IF EXISTS poster_url;

-- ── Recreate views ───────────────────────────────────────────

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

CREATE VIEW expiring_rights AS
SELECT
    pr.*,
    m.title  AS movie_title,
    m.source AS movie_source,
    p.name   AS platform_name,
    pr.end_date - CURRENT_DATE AS days_until_expiry
FROM platform_rights pr
JOIN movies m ON m.id = pr.movie_id
LEFT JOIN platforms p ON p.id = pr.platform_id
WHERE pr.is_current = TRUE
  AND pr.end_date IS NOT NULL
  AND pr.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
  AND m.approval_status = 'approved'
ORDER BY pr.end_date ASC;

CREATE VIEW available_for_rights AS
SELECT DISTINCT
    m.id,
    m.title,
    m.source,
    m.release_year,
    p.name      AS last_platform,
    pr.end_date AS rights_ended
FROM movies m
JOIN platform_rights pr ON pr.movie_id = m.id
LEFT JOIN platforms p ON p.id = pr.platform_id
WHERE pr.end_date < CURRENT_DATE
  AND NOT EXISTS (
      SELECT 1
      FROM platform_rights pr2
      WHERE pr2.movie_id = m.id
        AND pr2.is_current = TRUE
        AND (pr2.end_date IS NULL OR pr2.end_date > CURRENT_DATE)
  )
  AND m.approval_status = 'approved'
ORDER BY pr.end_date DESC;

CREATE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM movies WHERE approval_status = 'approved')                                                               AS total_movies,
    (SELECT COUNT(*) FROM movies WHERE source = 'home_production' AND approval_status = 'approved')                               AS home_productions,
    (SELECT COUNT(*) FROM movies WHERE source = 'acquired'        AND approval_status = 'approved')                               AS acquired_movies,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Actor'    AND m.approval_status = 'approved') AS total_actors,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Director' AND m.approval_status = 'approved') AS total_directors,
    (SELECT COUNT(*) FROM platform_rights pr JOIN movies m ON m.id = pr.movie_id WHERE pr.is_current = TRUE AND m.approval_status = 'approved') AS active_rights,
    (SELECT COUNT(*) FROM expiring_rights WHERE days_until_expiry <= 30) AS rights_expiring_30_days,
    (SELECT COUNT(*) FROM expiring_rights WHERE days_until_expiry <= 90) AS rights_expiring_90_days,
    (SELECT COUNT(*) FROM movies WHERE approval_status = 'pending')      AS pending_approvals;
