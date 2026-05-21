-- =============================================
-- Migration: Unified movie_people table + role tag on people
-- Run this once in Supabase SQL editor.
--
-- What this does:
--   1. Adds a `role` TEXT column to `people` (actor / director / both).
--   2. Creates `movie_people` – a single junction table replacing movie_cast + movie_directors.
--   3. Backfills movie_people from existing movie_cast rows.
--   4. Backfills movie_people from existing movie_directors rows.
--   5. Backfills the `role` tag on people from the junction rows.
--   6. Adds RLS policies matching the existing pattern.
--
-- The old movie_cast and movie_directors tables are LEFT INTACT so nothing breaks
-- while you transition the frontend. Drop them manually once the UI is fully migrated.
-- =============================================


-- ─── Step 1: Add role column to people ────────────────────────────────────────
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT NULL;

COMMENT ON COLUMN people.role IS 'Derived role tag: actor | director | both. Kept in sync by the app layer.';


-- ─── Step 2: Create movie_people ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movie_people (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id    UUID NOT NULL REFERENCES movies(id)  ON DELETE CASCADE,
    person_id   UUID NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('Actor', 'Director')),
    billing_order INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (movie_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_movie_people_movie  ON movie_people(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_people_person ON movie_people(person_id);
CREATE INDEX IF NOT EXISTS idx_movie_people_role   ON movie_people(role);

COMMENT ON TABLE movie_people IS
  'Unified cast+crew table. role = Actor or Director. Replaces movie_cast + movie_directors.';


-- ─── Step 3: Enable RLS (same pattern as other tables) ────────────────────────
ALTER TABLE movie_people ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'movie_people' AND policyname = 'Anyone can view movie_people'
  ) THEN
    CREATE POLICY "Anyone can view movie_people" ON movie_people FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'movie_people' AND policyname = 'Admins and editors can manage movie_people'
  ) THEN
    CREATE POLICY "Admins and editors can manage movie_people" ON movie_people
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE id = auth.uid() AND role IN ('admin', 'editor')
        )
      );
  END IF;
END $$;


-- ─── Step 4: Backfill Actors from movie_cast ──────────────────────────────────
INSERT INTO movie_people (movie_id, person_id, role, billing_order, created_at)
SELECT
    mc.movie_id,
    mc.person_id,
    'Actor'         AS role,
    mc.billing_order,
    mc.created_at
FROM movie_cast mc
ON CONFLICT (movie_id, person_id, role) DO NOTHING;


-- ─── Step 5: Backfill Directors from movie_directors ──────────────────────────
INSERT INTO movie_people (movie_id, person_id, role, billing_order, created_at)
SELECT
    md.movie_id,
    md.person_id,
    'Director'      AS role,
    NULL            AS billing_order,
    md.created_at
FROM movie_directors md
ON CONFLICT (movie_id, person_id, role) DO NOTHING;


-- ─── Step 6: Backfill people.role from the junction rows ──────────────────────
-- actor: appears only as Actor
UPDATE people p
SET role = 'actor'
WHERE EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Actor')
  AND NOT EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Director');

-- director: appears only as Director
UPDATE people p
SET role = 'director'
WHERE EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Director')
  AND NOT EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Actor');

-- both: appears in both roles
UPDATE people p
SET role = 'both'
WHERE EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Actor')
  AND EXISTS (SELECT 1 FROM movie_people mp WHERE mp.person_id = p.id AND mp.role = 'Director');


-- ─── Step 7: Refresh movies_with_details view to use movie_people ─────────────
-- Must DROP first — CREATE OR REPLACE fails when the existing view's column
-- order differs from the new definition (Postgres sees it as a column rename).
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


-- ─── Step 8: Recreate views dropped by CASCADE ───────────────────────────────
-- expiring_rights depends on platform_rights + movies (not movies_with_details),
-- but CASCADE on movies_with_details also dropped it. Recreate it first.
CREATE OR REPLACE VIEW expiring_rights AS
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
ORDER BY pr.end_date ASC;

-- available_for_rights may also have been dropped — recreate it.
CREATE OR REPLACE VIEW available_for_rights AS
SELECT DISTINCT
    m.id,
    m.title,
    m.source,
    m.release_year,
    p.name     AS last_platform,
    pr.end_date AS rights_ended,
    rt.name    AS rights_type
FROM movies m
JOIN platform_rights pr ON pr.movie_id = m.id
LEFT JOIN platforms p ON p.id = pr.platform_id
LEFT JOIN rights_types rt ON rt.id = pr.rights_type_id
WHERE pr.end_date < CURRENT_DATE
  AND NOT EXISTS (
      SELECT 1 FROM platform_rights pr2
      WHERE pr2.movie_id = m.id
        AND pr2.rights_type_id = pr.rights_type_id
        AND pr2.is_current = TRUE
        AND (pr2.end_date IS NULL OR pr2.end_date > CURRENT_DATE)
  )
ORDER BY pr.end_date DESC;

-- ─── Step 9: Recreate dashboard_stats ─────────────────────────────────────────
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*)          FROM movies)                                          AS total_movies,
    (SELECT COUNT(*)          FROM movies WHERE source = 'home_production')         AS home_productions,
    (SELECT COUNT(*)          FROM movies WHERE source = 'acquired')                AS acquired_movies,
    (SELECT COUNT(DISTINCT person_id) FROM movie_people WHERE role = 'Actor')       AS total_actors,
    (SELECT COUNT(DISTINCT person_id) FROM movie_people WHERE role = 'Director')    AS total_directors,
    (SELECT COUNT(*)          FROM platform_rights WHERE is_current = TRUE)         AS active_rights,
    (SELECT COUNT(*)          FROM expiring_rights WHERE days_until_expiry <= 30)   AS rights_expiring_30_days,
    (SELECT COUNT(*)          FROM expiring_rights WHERE days_until_expiry <= 90)   AS rights_expiring_90_days;


-- ─── Done ─────────────────────────────────────────────────────────────────────
-- To verify:
--   SELECT role, COUNT(*) FROM movie_people GROUP BY role;
--   SELECT role, COUNT(*) FROM people GROUP BY role;
--   SELECT cast_names, director_names FROM movies_with_details LIMIT 5;
