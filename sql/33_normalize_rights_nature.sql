-- ============================================================
-- 33 — normalise platform_rights.nature
--
-- `nature` is free text, so imports introduced case and spelling variants of
-- the same value: "Non-exclusive" beside "Non-Exclusive", "shared-Exclusive"
-- beside "Shared-Exclusive". Each variant shows up as its own entry in the
-- Nature column filter, and each one splits what should be a single group.
--
-- This folds every known variant onto one canonical spelling, and adds the
-- missing 'Shared-Exclusive' lookup row. The canonical set matches
-- baseAllowedNatures in src/components/forms/nature-selector.tsx — keep the
-- two in step.
--
-- Depends on: 05_rights_nature_types.sql
-- Idempotent: safe to run more than once.
-- ============================================================

BEGIN;

-- ── 1. Report what is about to change ────────────────────────
-- Run this SELECT on its own first if you want to see the damage before
-- committing; the UPDATE below covers exactly these rows.
--
--   SELECT nature, COUNT(*) FROM platform_rights
--   WHERE nature IS NOT NULL GROUP BY nature ORDER BY nature;

-- ── 2. Canonicalise platform_rights.nature ───────────────────
-- Matching is on the trimmed, lower-cased value with separators collapsed, so
-- "shared exclusive", "Shared-Exclusive" and "shared_exclusive" all land on
-- the same canonical spelling without needing a branch each.
UPDATE platform_rights
SET nature = CASE regexp_replace(lower(btrim(nature)), '[\s_-]+', '-', 'g')
    WHEN 'exclusive'           THEN 'Exclusive'
    WHEN 'non-exclusive'       THEN 'Non-Exclusive'
    WHEN 'nonexclusive'        THEN 'Non-Exclusive'
    WHEN 'shared-exclusive'    THEN 'Shared-Exclusive'
    WHEN 'jointly-owned'       THEN 'Jointly Owned'
    WHEN 'jointly-production'  THEN 'Jointly Owned'
    WHEN 'joint-production'    THEN 'Jointly Owned'
    WHEN 'sold-to-grassroot'   THEN 'Sold to Grassroot'
    WHEN 'sold-expired'        THEN 'Sold/Expired'
    WHEN 'sold'                THEN 'Sold/Expired'
    WHEN 'n-a'                 THEN 'N/A'
    WHEN 'na'                  THEN 'N/A'
    ELSE nature
END
WHERE nature IS NOT NULL
  -- Only touch rows that actually change, so re-running is a no-op.
  AND nature IS DISTINCT FROM (CASE regexp_replace(lower(btrim(nature)), '[\s_-]+', '-', 'g')
    WHEN 'exclusive'           THEN 'Exclusive'
    WHEN 'non-exclusive'       THEN 'Non-Exclusive'
    WHEN 'nonexclusive'        THEN 'Non-Exclusive'
    WHEN 'shared-exclusive'    THEN 'Shared-Exclusive'
    WHEN 'jointly-owned'       THEN 'Jointly Owned'
    WHEN 'jointly-production'  THEN 'Jointly Owned'
    WHEN 'joint-production'    THEN 'Jointly Owned'
    WHEN 'sold-to-grassroot'   THEN 'Sold to Grassroot'
    WHEN 'sold-expired'        THEN 'Sold/Expired'
    WHEN 'sold'                THEN 'Sold/Expired'
    WHEN 'n-a'                 THEN 'N/A'
    WHEN 'na'                  THEN 'N/A'
    ELSE nature
  END);

-- Blank strings read as a value in the filter but mean "unset".
UPDATE platform_rights SET nature = NULL WHERE btrim(coalesce(nature, '')) = '';

-- ── 3. Same treatment for movie_rights, which carries the field too ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movie_rights' AND column_name = 'nature'
  ) THEN
    UPDATE movie_rights
    SET nature = CASE regexp_replace(lower(btrim(nature)), '[\s_-]+', '-', 'g')
        WHEN 'exclusive'          THEN 'Exclusive'
        WHEN 'non-exclusive'      THEN 'Non-Exclusive'
        WHEN 'nonexclusive'       THEN 'Non-Exclusive'
        WHEN 'shared-exclusive'   THEN 'Shared-Exclusive'
        WHEN 'jointly-owned'      THEN 'Jointly Owned'
        WHEN 'jointly-production' THEN 'Jointly Owned'
        WHEN 'joint-production'   THEN 'Jointly Owned'
        WHEN 'sold-to-grassroot'  THEN 'Sold to Grassroot'
        WHEN 'sold-expired'       THEN 'Sold/Expired'
        WHEN 'sold'               THEN 'Sold/Expired'
        WHEN 'n-a'                THEN 'N/A'
        WHEN 'na'                 THEN 'N/A'
        ELSE nature
    END
    WHERE nature IS NOT NULL;

    UPDATE movie_rights SET nature = NULL WHERE btrim(coalesce(nature, '')) = '';
  END IF;
END $$;

-- ── 4. Fix the lookup table ──────────────────────────────────
-- The original seed spelled it "Shared Exclusive" (space) while the app writes
-- "Shared-Exclusive" (hyphen), so the option never matched and never appeared.
UPDATE rights_nature_types SET name = 'Shared-Exclusive' WHERE name = 'Shared Exclusive';
UPDATE rights_nature_types SET name = 'Jointly Owned'    WHERE name = 'Jointly Production';

INSERT INTO rights_nature_types (name, description) VALUES
    ('Exclusive',         'Exclusive rights'),
    ('Non-Exclusive',     'Non-exclusive rights'),
    ('Shared-Exclusive',  'Shared exclusive rights'),
    ('Jointly Owned',     'Jointly produced / co-production'),
    ('Sold to Grassroot', 'Sold to Grassroot'),
    ('Sold/Expired',      'Rights sold or expired'),
    ('N/A',               'Not applicable')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ── 5. Verify ────────────────────────────────────────────────
-- Expect only canonical spellings, each appearing once:
--
--   SELECT nature, COUNT(*) FROM platform_rights
--   WHERE nature IS NOT NULL GROUP BY nature ORDER BY nature;
