-- ============================================================
-- phase2_03 — migrate flat rights columns → movie_rights
-- Reads each acquired movie's flat right columns and inserts
-- one movie_rights row per right type that has a 'Yes' flag
-- (or a non-null nature, for cases where the flag is missing
-- but nature data exists).
--
-- Applies to acquired movies only (source = 'acquired').
-- Home productions are skipped intentionally.
--
-- Safe to re-run: uses ON CONFLICT DO NOTHING on a unique
-- partial index created below. Run phase2_01 before this.
-- ============================================================

-- Unique index to make the migration idempotent:
-- one row per (movie_id, right_type, nature, territory).
-- territory and nature are lowercased for dedup stability.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_rights_dedup
    ON movie_rights (
        movie_id,
        right_type,
        LOWER(COALESCE(nature, '')),
        LOWER(COALESCE(territory, ''))
    );

-- ── Satellite Rights ─────────────────────────────────────────
INSERT INTO movie_rights (
    movie_id, right_type, classification, nature,
    territory, start_date, end_date,
    syndication, holdbacks, created_at, updated_at
)
SELECT
    id,
    'Satellite',
    satellite_rights_classification,
    COALESCE(NULLIF(TRIM(nature_of_satellite_rights), ''), 'Exclusive'),
    territory,
    satellite_rights_start_date,
    satellite_rights_end_date,
    NULL,       -- syndication not tracked per-right for satellite
    holdbacks,
    NOW(),
    NOW()
FROM movies
WHERE source = 'acquired'
  AND (
      satellite_rights = 'Yes'
      OR (nature_of_satellite_rights IS NOT NULL AND TRIM(nature_of_satellite_rights) <> '')
  )
ON CONFLICT DO NOTHING;

-- ── Internet Rights ──────────────────────────────────────────
INSERT INTO movie_rights (
    movie_id, right_type, classification, nature,
    territory, start_date, end_date,
    syndication, holdbacks, created_at, updated_at
)
SELECT
    id,
    'Internet',
    internet_rights_classification,
    COALESCE(NULLIF(TRIM(nature_of_internet_rights), ''), 'Exclusive'),
    territory,
    internet_rights_start_date,
    internet_rights_end_date,
    syndication_internet_rights,
    holdbacks,
    NOW(),
    NOW()
FROM movies
WHERE source = 'acquired'
  AND (
      internet_rights = 'Yes'
      OR (nature_of_internet_rights IS NOT NULL AND TRIM(nature_of_internet_rights) <> '')
  )
ON CONFLICT DO NOTHING;

-- ── Negative Rights ──────────────────────────────────────────
INSERT INTO movie_rights (
    movie_id, right_type, classification, nature,
    territory, start_date, end_date,
    syndication, holdbacks, created_at, updated_at
)
SELECT
    id,
    'Negative',
    NULL,
    COALESCE(NULLIF(TRIM(nature_of_negative_rights), ''), 'Exclusive'),
    territory,
    negative_rights_start_date,
    negative_rights_end_date,
    NULL,
    holdbacks,
    NOW(),
    NOW()
FROM movies
WHERE source = 'acquired'
  AND (
      negative_rights = 'Yes'
      OR (nature_of_negative_rights IS NOT NULL AND TRIM(nature_of_negative_rights) <> '')
  )
ON CONFLICT DO NOTHING;

-- ── Other Rights ─────────────────────────────────────────────
-- other_rights column sometimes holds a descriptive name
-- (e.g. "Cable TV") instead of plain 'Yes' — treat any
-- non-null, non-'No' value as an active right.
INSERT INTO movie_rights (
    movie_id, right_type, classification, nature,
    territory, start_date, end_date,
    syndication, holdbacks, created_at, updated_at
)
SELECT
    id,
    'Other',
    CASE
        WHEN other_rights NOT IN ('Yes', 'No', 'N', 'N/A') THEN other_rights
        ELSE NULL
    END,
    COALESCE(NULLIF(TRIM(nature_of_other_rights), ''), 'Exclusive'),
    territory,
    other_rights_start_date,
    other_rights_end_date,
    NULL,
    holdbacks,
    NOW(),
    NOW()
FROM movies
WHERE source = 'acquired'
  AND (
      (other_rights IS NOT NULL AND TRIM(other_rights) NOT IN ('', 'No', 'N', 'N/A'))
      OR (nature_of_other_rights IS NOT NULL AND TRIM(nature_of_other_rights) <> '')
  )
ON CONFLICT DO NOTHING;

-- ── Verification query (read-only, safe to run after migration) ──
-- SELECT right_type, COUNT(*) FROM movie_rights GROUP BY right_type ORDER BY right_type;
