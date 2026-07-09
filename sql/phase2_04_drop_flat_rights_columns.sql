-- ============================================================
-- phase2_04 — drop flat rights columns from movies
-- Removes all right-type flat columns that have been migrated
-- into the movie_rights table by phase2_03.
--
-- IMPORTANT: Run phase2_03_migrate_flat_rights.sql first and
-- verify row counts before running this file. This is
-- irreversible without a database restore.
--
-- Safe to re-run (DROP COLUMN IF EXISTS throughout).
-- Depends on: phase2_01, phase2_02, phase2_03
-- ============================================================

-- ── Drop views that reference movies.* so the column drops ──
-- don't fail on dependent objects. views.sql recreates them.
DROP VIEW IF EXISTS dashboard_stats      CASCADE;
DROP VIEW IF EXISTS available_for_rights CASCADE;
DROP VIEW IF EXISTS expiring_rights      CASCADE;
DROP VIEW IF EXISTS movies_with_details  CASCADE;

-- ── Drop indexes on columns being removed ────────────────────
DROP INDEX IF EXISTS idx_movies_sat_rights;
DROP INDEX IF EXISTS idx_movies_int_rights;
DROP INDEX IF EXISTS idx_movies_neg_rights;
DROP INDEX IF EXISTS idx_movies_satellite_rights;
DROP INDEX IF EXISTS idx_movies_internet_rights;
DROP INDEX IF EXISTS idx_movies_negative_rights;

-- ── Drop the flat rights columns ─────────────────────────────

-- Satellite
ALTER TABLE movies
    DROP COLUMN IF EXISTS satellite_rights,
    DROP COLUMN IF EXISTS satellite_rights_classification,
    DROP COLUMN IF EXISTS nature_of_satellite_rights,
    DROP COLUMN IF EXISTS satellite_rights_start_date,
    DROP COLUMN IF EXISTS satellite_rights_end_date;

-- Internet
ALTER TABLE movies
    DROP COLUMN IF EXISTS internet_rights,
    DROP COLUMN IF EXISTS internet_rights_classification,
    DROP COLUMN IF EXISTS syndication_internet_rights,
    DROP COLUMN IF EXISTS nature_of_internet_rights,
    DROP COLUMN IF EXISTS internet_rights_start_date,
    DROP COLUMN IF EXISTS internet_rights_end_date;

-- Negative
ALTER TABLE movies
    DROP COLUMN IF EXISTS negative_rights,
    DROP COLUMN IF EXISTS nature_of_negative_rights,
    DROP COLUMN IF EXISTS negative_rights_start_date,
    DROP COLUMN IF EXISTS negative_rights_end_date;

-- Other
ALTER TABLE movies
    DROP COLUMN IF EXISTS other_rights,
    DROP COLUMN IF EXISTS nature_of_other_rights,
    DROP COLUMN IF EXISTS other_rights_start_date,
    DROP COLUMN IF EXISTS other_rights_end_date;

-- Movie-level holdbacks (now stored per-row in movie_rights
-- and per-platform in platform_rights)
ALTER TABLE movies
    DROP COLUMN IF EXISTS holdbacks;

-- ── Columns intentionally kept on movies ─────────────────────
-- clip_rights, clip_rights_duration  — standalone, no nature/territory
-- nature_of_rights                   — home production free text, untouched
-- territory                          — movie-level default territory
-- prequel_sequel_rights, character_rights, subtitling_rights, dubbing_rights
-- All acquisition / core / admin fields

-- ── Recreate views ───────────────────────────────────────────
-- Run views.sql after this file to restore all views.
-- Inline recreation here so this file is self-contained:

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
