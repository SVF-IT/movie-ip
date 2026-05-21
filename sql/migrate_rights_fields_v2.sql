-- ============================================================
-- Migration: Primary Rights fields + Clip Rights + Holdbacks
-- Apply this to an existing live database that already has all
-- prior migrations applied (up to and including add_wtp_library.sql,
-- migrate_movie_people.sql, add_approval_flow.sql, etc.)
--
-- Safe to re-run (all ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE movies
    -- Primary Rights Yes/No flags
    ADD COLUMN IF NOT EXISTS satellite_rights TEXT,
    ADD COLUMN IF NOT EXISTS internet_rights  TEXT,
    ADD COLUMN IF NOT EXISTS negative_rights  TEXT,
    ADD COLUMN IF NOT EXISTS other_rights     TEXT,

    -- Rights sub-classifications (comma-separated multi-select values)
    -- satellite_rights_classification: "Pay TV", "Free TV", "Pay Per View", "DTH"
    -- internet_rights_classification already exists — no new column needed
    ADD COLUMN IF NOT EXISTS satellite_rights_classification TEXT,

    -- Holdbacks: stored as "on VALUE1,VALUE2"
    -- Options: "Audio Rights", "Theatrical Exploitation", "FVOD", "AVOD"
    ADD COLUMN IF NOT EXISTS holdbacks TEXT,

    -- Clip Rights
    ADD COLUMN IF NOT EXISTS clip_rights          TEXT,
    ADD COLUMN IF NOT EXISTS clip_rights_duration TEXT,

    -- Nature per right type
    ADD COLUMN IF NOT EXISTS nature_of_satellite_rights TEXT,
    ADD COLUMN IF NOT EXISTS nature_of_internet_rights  TEXT,
    ADD COLUMN IF NOT EXISTS nature_of_negative_rights  TEXT,
    ADD COLUMN IF NOT EXISTS nature_of_other_rights     TEXT,

    -- Per-right-type date ranges (satellite/internet dates already exist above)
    ADD COLUMN IF NOT EXISTS negative_rights_start_date DATE,
    ADD COLUMN IF NOT EXISTS negative_rights_end_date   DATE,
    ADD COLUMN IF NOT EXISTS other_rights_start_date    DATE,
    ADD COLUMN IF NOT EXISTS other_rights_end_date      DATE;

-- Indexes for the Yes/No flag columns (queried by dashboard filters)
CREATE INDEX IF NOT EXISTS idx_movies_satellite_rights ON movies (satellite_rights);
CREATE INDEX IF NOT EXISTS idx_movies_internet_rights  ON movies (internet_rights);
CREATE INDEX IF NOT EXISTS idx_movies_negative_rights  ON movies (negative_rights);
