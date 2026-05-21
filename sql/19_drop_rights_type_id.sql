-- ============================================================
-- 19 — Drop rights_type_id, is_expired, rights_history table, and renew/transfer functions
-- Rights classification is now derived from platforms.platform_type
-- Expired rights are determined by end_date < today (no stored flag needed)
-- Run once on the live DB.
-- ============================================================

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS dashboard_stats;
DROP VIEW IF EXISTS available_for_rights;
DROP VIEW IF EXISTS expiring_rights;

-- Step 2: Drop renew/transfer functions (no longer needed)
DROP FUNCTION IF EXISTS public.renew_right(uuid, date, text);
DROP FUNCTION IF EXISTS public.transfer_right(uuid, uuid, date, date, text, uuid);

-- Step 3: Drop rights_history table entirely
DROP TABLE IF EXISTS rights_history;

-- Step 4: Drop rights_type_id and is_expired columns from platform_rights
ALTER TABLE platform_rights DROP COLUMN IF EXISTS rights_type_id;
ALTER TABLE platform_rights DROP COLUMN IF EXISTS is_expired;

-- Step 5: Recreate expiring_rights — use platforms.platform_type instead of rights_types join
CREATE OR REPLACE VIEW expiring_rights AS
SELECT
    pr.*,
    m.title         AS movie_title,
    m.source        AS movie_source,
    p.name          AS platform_name,
    p.platform_type AS rights_type_name,
    pr.end_date - CURRENT_DATE AS days_until_expiry
FROM platform_rights pr
JOIN movies m ON m.id = pr.movie_id
LEFT JOIN platforms p ON p.id = pr.platform_id
WHERE pr.is_current = TRUE
  AND pr.end_date IS NOT NULL
  AND pr.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
  AND m.approval_status = 'approved'
ORDER BY pr.end_date ASC;

-- Step 6: Recreate available_for_rights — no longer grouped by rights_type_id
CREATE OR REPLACE VIEW available_for_rights AS
SELECT DISTINCT
    m.id, m.title, m.source, m.release_year,
    p.name          AS last_platform,
    pr.end_date     AS rights_ended,
    p.platform_type AS rights_type
FROM movies m
JOIN platform_rights pr ON pr.movie_id = m.id
LEFT JOIN platforms p ON p.id = pr.platform_id
WHERE pr.end_date < CURRENT_DATE
  AND NOT EXISTS (
      SELECT 1 FROM platform_rights pr2
      WHERE pr2.movie_id = m.id
        AND pr2.platform_id = pr.platform_id
        AND pr2.is_current = TRUE
        AND (pr2.end_date IS NULL OR pr2.end_date > CURRENT_DATE)
  )
  AND m.approval_status = 'approved'
ORDER BY pr.end_date DESC;

-- Step 7: Recreate dashboard_stats (depends on expiring_rights)
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM movies WHERE approval_status = 'approved')                                                          AS total_movies,
    (SELECT COUNT(*) FROM movies WHERE source = 'home_production' AND approval_status = 'approved')                          AS home_productions,
    (SELECT COUNT(*) FROM movies WHERE source = 'acquired'        AND approval_status = 'approved')                          AS acquired_movies,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Actor'    AND m.approval_status = 'approved') AS total_actors,
    (SELECT COUNT(DISTINCT mp.person_id) FROM movie_people mp JOIN movies m ON m.id = mp.movie_id WHERE mp.role = 'Director' AND m.approval_status = 'approved') AS total_directors,
    (SELECT COUNT(*) FROM platform_rights pr JOIN movies m ON m.id = pr.movie_id WHERE pr.is_current = TRUE AND m.approval_status = 'approved') AS active_rights,
    (SELECT COUNT(*) FROM expiring_rights WHERE days_until_expiry <= 30) AS rights_expiring_30_days,
    (SELECT COUNT(*) FROM expiring_rights WHERE days_until_expiry <= 90) AS rights_expiring_90_days,
    (SELECT COUNT(*) FROM movies WHERE approval_status = 'pending')      AS pending_approvals;
