-- ============================================================
-- 22 — Schema cleanup
-- • Add jointly_exploitation_rights (correct spelling)
-- • Drop jointly_exploitation_right (typo column)
-- • Drop legacy fields: primary_rights_acquired, fvod_holdback,
--   avod_holdback, secondary_rights
-- • Change release_date and release_year to TEXT so free-text
--   values like "UNRELEASED" and "TBD" are supported
--
-- After running this migration, run views.sql to refresh all views.
-- ============================================================

-- Step 1: Drop views that depend on the movies table columns we're changing.
-- views.sql will recreate them correctly after this migration.
DROP VIEW IF EXISTS dashboard_stats      CASCADE;
DROP VIEW IF EXISTS available_for_rights CASCADE;
DROP VIEW IF EXISTS expiring_rights      CASCADE;
DROP VIEW IF EXISTS movies_with_details  CASCADE;

-- Step 2: Add the correctly-named column
ALTER TABLE movies ADD COLUMN IF NOT EXISTS jointly_exploitation_rights TEXT;

-- Step 3: Copy any data from the misnamed column if it exists, then drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movies' AND column_name = 'jointly_exploitation_right'
  ) THEN
    UPDATE movies
    SET jointly_exploitation_rights = jointly_exploitation_right
    WHERE jointly_exploitation_rights IS NULL AND jointly_exploitation_right IS NOT NULL;

    ALTER TABLE movies DROP COLUMN jointly_exploitation_right;
  END IF;
END;
$$;

-- Step 4: Drop legacy columns no longer used in the UI
ALTER TABLE movies DROP COLUMN IF EXISTS primary_rights_acquired;
ALTER TABLE movies DROP COLUMN IF EXISTS fvod_holdback;
ALTER TABLE movies DROP COLUMN IF EXISTS avod_holdback;
ALTER TABLE movies DROP COLUMN IF EXISTS secondary_rights;

-- Step 5: Change release_date from DATE to TEXT (supports "UNRELEASED", "TBD", etc.)
ALTER TABLE movies ALTER COLUMN release_date TYPE TEXT USING release_date::TEXT;

-- Step 6: Change release_year from INTEGER to TEXT (supports "UNRELEASED", "TBD", etc.)
ALTER TABLE movies ALTER COLUMN release_year TYPE TEXT USING release_year::TEXT;

-- ── Run views.sql next to recreate all views ─────────────────
