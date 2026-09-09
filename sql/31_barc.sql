-- ============================================================
-- 31 — BARC ratings
-- Weekly/monthly BARC telecast data uploaded as .xlsx sheets.
--
--   barc_sheets       one row per uploaded file (sidebar list; delete
--                     removes the storage object app-side, then the row,
--                     which cascades to its telecasts)
--   barc_descriptions dictionary mapping a BARC "Description" string to a
--                     movie. Seeded by SQL (title + description pairs),
--                     NOT fuzzy-matched at upload. Survives sheet deletion.
--                     Unmapped = movie_id IS NULL; no separate status column.
--   barc_telecasts    every row of every sheet — the source of truth.
--                     One row per (telecast x target audience).
--   barc_movie_yearly_metrics
--                     recomputed cache of per-movie/year/target NIMS, GRP
--                     and weighted ATS. Never the source of truth.
--
-- Depends on: 06_movies.sql, 12_user_profiles.sql, 14_audit_logs.sql
--
-- Safe to re-run: every object is created IF NOT EXISTS, and triggers and
-- policies are dropped first, so a partial run can simply be applied again.
-- Existing data is left untouched.
-- ============================================================

-- ── Normalisation helper ─────────────────────────────────────
-- The single definition of the lookup key. The upload parser must produce a
-- byte-identical result; keep the two in step.
CREATE OR REPLACE FUNCTION barc_normalize_description(txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(
        btrim(
            regexp_replace(
                regexp_replace(upper(COALESCE(txt, '')), '[^A-Z0-9]+', ' ', 'g'),
                '\s+', ' ', 'g'
            )
        ),
    '')::TEXT;
$$;

-- ── Sheets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barc_sheets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name        TEXT NOT NULL,
    file_path        TEXT NOT NULL,
    file_size        BIGINT,
    row_count        INTEGER NOT NULL DEFAULT 0,
    matched_count    INTEGER NOT NULL DEFAULT 0,
    -- Period actually covered by the parsed rows (min/max of telecast_date).
    period_start     DATE,
    period_end       DATE,
    notes            TEXT,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Description dictionary ───────────────────────────────────
-- Two meaningful columns: the description as it appears in the sheet, and the
-- movie it refers to. `description_key` is the generated lookup key used to
-- join sheet rows — upper-cased, punctuation stripped, whitespace collapsed —
-- so it can never drift out of step with `description`.
-- A NULL movie_id is the whole of "not mapped yet"; no status column restates it.
CREATE TABLE IF NOT EXISTS barc_descriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description     TEXT NOT NULL,
    description_key TEXT GENERATED ALWAYS AS (barc_normalize_description(description)) STORED UNIQUE,
    movie_id        UUID REFERENCES movies(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barc_descriptions_movie_id ON barc_descriptions (movie_id);

-- Upgrade an older barc_descriptions (description_raw/normalized + status).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_descriptions' AND column_name = 'description_raw')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_descriptions' AND column_name = 'description') THEN
        ALTER TABLE barc_descriptions RENAME COLUMN description_raw TO description;
    END IF;

    -- description_key is generated; the old plain column cannot become one.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_descriptions' AND column_name = 'description_normalized') THEN
        ALTER TABLE barc_descriptions DROP COLUMN description_normalized;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_descriptions' AND column_name = 'description_key') THEN
        ALTER TABLE barc_descriptions
            ADD COLUMN description_key TEXT
            GENERATED ALWAYS AS (barc_normalize_description(description)) STORED;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_barc_descriptions_key
            ON barc_descriptions (description_key);
    END IF;

    ALTER TABLE barc_descriptions DROP COLUMN IF EXISTS match_status;
    ALTER TABLE barc_descriptions DROP COLUMN IF EXISTS seeded_title;
    ALTER TABLE barc_descriptions DROP COLUMN IF EXISTS notes;
    ALTER TABLE barc_descriptions DROP COLUMN IF EXISTS created_by;
    ALTER TABLE barc_descriptions DROP COLUMN IF EXISTS created_by_name;
END $$;

-- ── Telecasts ────────────────────────────────────────────────
-- start_time/end_time are stored as seconds from the start of the BARC
-- broadcast day, NOT as `time` — BARC clocks run past 24:00 (e.g. 25:00:53
-- is 1:00:53 AM on the following calendar day), which a `time` column cannot
-- hold. The original strings are kept for display.
CREATE TABLE IF NOT EXISTS barc_telecasts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sheet_id            UUID NOT NULL REFERENCES barc_sheets(id) ON DELETE CASCADE,
    description_id      UUID REFERENCES barc_descriptions(id) ON DELETE SET NULL,
    movie_id            UUID REFERENCES movies(id) ON DELETE SET NULL,

    -- The 13 identity columns below are NOT NULL with sentinel defaults, not
    -- nullable: a unique index over plain columns can be inferred by
    -- ON CONFLICT, whereas one over COALESCE(...) expressions cannot, and the
    -- import relies on that inference. NULLs would also never compare equal,
    -- silently letting duplicate rows past the guard.
    region              TEXT    NOT NULL DEFAULT '',
    week                INTEGER NOT NULL DEFAULT -1,
    channel             TEXT    NOT NULL DEFAULT '',
    telecast_date       DATE    NOT NULL,
    telecast_year       INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM telecast_date)::INTEGER) STORED,
    description_raw     TEXT    NOT NULL,
    programme_theme     TEXT    NOT NULL DEFAULT '',
    programme_genre     TEXT    NOT NULL DEFAULT '',
    week_day            TEXT    NOT NULL DEFAULT '',

    start_time_raw      TEXT,
    start_time_sec      INTEGER NOT NULL DEFAULT -1,
    end_time_raw        TEXT,
    end_time_sec        INTEGER NOT NULL DEFAULT -1,
    length_raw          TEXT    NOT NULL DEFAULT '',
    length_sec          INTEGER NOT NULL DEFAULT -1,

    target              TEXT    NOT NULL,
    -- "n.a" in the sheet becomes NULL, never 0, so it is excluded from
    -- weighted averages instead of dragging them down.
    rat_pct             NUMERIC(10,4),
    daily_avg_rch_pct   NUMERIC(14,4),
    ats_raw             TEXT,
    ats_sec             INTEGER,

    -- Derived at import (see src/lib/barc/parse-sheet.ts):
    --   grp = (length_sec * rat_pct) / 1800
    --   nst = start time rounded to the nearest half hour, as a clock label
    grp                 NUMERIC(16,6),
    nst_raw             TEXT,
    nst_sec             INTEGER,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Upgrade an existing installation ─────────────────────────
-- CREATE TABLE IF NOT EXISTS skips the table entirely when it already exists,
-- so a database created by an earlier version of this file would keep the old
-- column set (symptom: "column barc_telecasts.grp does not exist"). These
-- statements bring such a table up to date; they are no-ops on a fresh one.
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS grp       NUMERIC(16,6);
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS nst_raw   TEXT;
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS nst_sec   INTEGER;
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS programme_theme TEXT NOT NULL DEFAULT '';
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS programme_genre TEXT NOT NULL DEFAULT '';
ALTER TABLE barc_telecasts ADD COLUMN IF NOT EXISTS daily_avg_rch_pct NUMERIC(14,4);

-- Older versions named these differently; carry the data across if present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_telecasts' AND column_name = 'programme_category') THEN
        UPDATE barc_telecasts SET programme_theme = COALESCE(programme_category, '')
         WHERE programme_theme = '';
        ALTER TABLE barc_telecasts DROP COLUMN programme_category;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_telecasts' AND column_name = 'programme_sub') THEN
        UPDATE barc_telecasts SET programme_genre = COALESCE(programme_sub, '')
         WHERE programme_genre = '';
        ALTER TABLE barc_telecasts DROP COLUMN programme_sub;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'barc_telecasts' AND column_name = 'daily_avg_reach') THEN
        UPDATE barc_telecasts SET daily_avg_rch_pct = daily_avg_reach
         WHERE daily_avg_rch_pct IS NULL;
        ALTER TABLE barc_telecasts DROP COLUMN daily_avg_reach;
    END IF;
END $$;

-- The 13 identity columns must be NOT NULL with sentinel defaults for the
-- uniqueness guard to work (NULLs never compare equal). Backfill any nulls
-- left by an older schema, then enforce it.
UPDATE barc_telecasts SET region         = '' WHERE region         IS NULL;
UPDATE barc_telecasts SET channel        = '' WHERE channel        IS NULL;
UPDATE barc_telecasts SET week_day       = '' WHERE week_day       IS NULL;
UPDATE barc_telecasts SET length_raw     = '' WHERE length_raw     IS NULL;
UPDATE barc_telecasts SET week           = -1 WHERE week           IS NULL;
UPDATE barc_telecasts SET start_time_sec = -1 WHERE start_time_sec IS NULL;
UPDATE barc_telecasts SET end_time_sec   = -1 WHERE end_time_sec   IS NULL;
UPDATE barc_telecasts SET length_sec     = -1 WHERE length_sec     IS NULL;

ALTER TABLE barc_telecasts ALTER COLUMN region         SET DEFAULT '';
ALTER TABLE barc_telecasts ALTER COLUMN channel        SET DEFAULT '';
ALTER TABLE barc_telecasts ALTER COLUMN week_day       SET DEFAULT '';
ALTER TABLE barc_telecasts ALTER COLUMN length_raw     SET DEFAULT '';
ALTER TABLE barc_telecasts ALTER COLUMN week           SET DEFAULT -1;
ALTER TABLE barc_telecasts ALTER COLUMN start_time_sec SET DEFAULT -1;
ALTER TABLE barc_telecasts ALTER COLUMN end_time_sec   SET DEFAULT -1;
ALTER TABLE barc_telecasts ALTER COLUMN length_sec     SET DEFAULT -1;

ALTER TABLE barc_telecasts ALTER COLUMN region         SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN channel        SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN week_day       SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN length_raw     SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN week           SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN start_time_sec SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN end_time_sec   SET NOT NULL;
ALTER TABLE barc_telecasts ALTER COLUMN length_sec     SET NOT NULL;

-- Replace the earlier, narrower uniqueness guard with the 13-column one.
DROP INDEX IF EXISTS uq_barc_telecast_slot;

CREATE INDEX IF NOT EXISTS idx_barc_telecasts_sheet_id    ON barc_telecasts (sheet_id);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_movie_id    ON barc_telecasts (movie_id);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_description ON barc_telecasts (description_id);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_date        ON barc_telecasts (telecast_date);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_year_target ON barc_telecasts (telecast_year, target);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_channel     ON barc_telecasts (channel);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_region      ON barc_telecasts (region);
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_week        ON barc_telecasts (week);
-- Drives the per-movie/year rollups.
CREATE INDEX IF NOT EXISTS idx_barc_telecasts_rollup      ON barc_telecasts (movie_id, telecast_year, target);

-- A telecast row is unique on the full set of sheet identity columns, so a
-- re-uploaded overlapping period cannot silently double GRP. Targets is part
-- of the key: each telecast legitimately appears once per target audience.
CREATE UNIQUE INDEX IF NOT EXISTS uq_barc_telecast_row ON barc_telecasts (
    region, week, channel, telecast_date, description_raw,
    programme_theme, programme_genre, week_day,
    start_time_sec, end_time_sec, length_raw, length_sec, target
);

-- ── Yearly metrics cache ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS barc_movie_yearly_metrics (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id         UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    year             INTEGER NOT NULL,
    target           TEXT NOT NULL,
    channel          TEXT,
    region           TEXT,
    nims             NUMERIC(16,4),
    grp              NUMERIC(16,4),
    weighted_ats_sec NUMERIC(12,2),
    telecast_count   INTEGER NOT NULL DEFAULT 0,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (movie_id, year, target, channel, region)
);

CREATE INDEX IF NOT EXISTS idx_barc_yearly_movie ON barc_movie_yearly_metrics (movie_id);
CREATE INDEX IF NOT EXISTS idx_barc_yearly_year  ON barc_movie_yearly_metrics (year);

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_barc_sheets_updated_at ON barc_sheets;
CREATE TRIGGER trg_barc_sheets_updated_at
    BEFORE UPDATE ON barc_sheets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_barc_descriptions_updated_at ON barc_descriptions;
CREATE TRIGGER trg_barc_descriptions_updated_at
    BEFORE UPDATE ON barc_descriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
-- barc_telecasts is deliberately not audited: a single upload inserts tens of
-- thousands of rows and would swamp the audit log. The sheet record is the
-- auditable unit.
DROP TRIGGER IF EXISTS audit_barc_sheets_insert ON barc_sheets;
CREATE TRIGGER audit_barc_sheets_insert AFTER INSERT ON barc_sheets FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_barc_sheets_update ON barc_sheets;
CREATE TRIGGER audit_barc_sheets_update AFTER UPDATE ON barc_sheets FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_barc_sheets_delete ON barc_sheets;
CREATE TRIGGER audit_barc_sheets_delete AFTER DELETE ON barc_sheets FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_barc_descriptions_insert ON barc_descriptions;
CREATE TRIGGER audit_barc_descriptions_insert AFTER INSERT ON barc_descriptions FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_barc_descriptions_update ON barc_descriptions;
CREATE TRIGGER audit_barc_descriptions_update AFTER UPDATE ON barc_descriptions FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_barc_descriptions_delete ON barc_descriptions;
CREATE TRIGGER audit_barc_descriptions_delete AFTER DELETE ON barc_descriptions FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── Seeding helper ───────────────────────────────────────────
-- Usage — supply (movie title, BARC description) pairs:
--
--   SELECT barc_seed_description('Bagh Bandi Khela', 'BAGH BANDI KHELA');
--
-- or in bulk:
--
--   SELECT barc_seed_description(t.title, t.descr)
--   FROM (VALUES
--       ('Bagh Bandi Khela', 'BAGH BANDI KHELA'),
--       ('Howrah Bridge',    'HOWRAH BRIDGE')
--   ) AS t(title, descr);
--
-- Title resolution is exact on the same normalisation used for descriptions,
-- so casing and punctuation differences do not matter. A title matching no
-- movie (or more than one) raises, rather than silently storing an unmapped
-- row — a typo in a seed script should be loud.
CREATE OR REPLACE FUNCTION barc_seed_description(p_title TEXT, p_description TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_movie_id UUID;
    v_count    INTEGER;
    v_id       UUID;
BEGIN
    IF barc_normalize_description(p_description) IS NULL THEN
        RAISE EXCEPTION 'BARC description is empty: %', p_description;
    END IF;

    -- MIN() has no uuid overload, so count and pick separately.
    SELECT COUNT(*) INTO v_count
      FROM movies m
     WHERE barc_normalize_description(m.title) = barc_normalize_description(p_title);

    SELECT m.id INTO v_movie_id
      FROM movies m
     WHERE barc_normalize_description(m.title) = barc_normalize_description(p_title)
     LIMIT 1;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No movie titled %', p_title;
    ELSIF v_count > 1 THEN
        RAISE EXCEPTION '% movies titled % — map this description by id instead', v_count, p_title;
    END IF;

    INSERT INTO barc_descriptions (description, movie_id)
    VALUES (p_description, v_movie_id)
    ON CONFLICT (description_key) DO UPDATE
       SET movie_id   = EXCLUDED.movie_id,
           updated_at = NOW()
    RETURNING id INTO v_id;

    -- Attach telecasts already imported under this description.
    UPDATE barc_telecasts
       SET description_id = v_id,
           movie_id       = v_movie_id
     WHERE barc_normalize_description(description_raw)
           = barc_normalize_description(p_description);

    RETURN v_id;
END;
$$;

-- ── Duplicate detection ──────────────────────────────────────
-- The upload flow needs to know, before writing anything, how many of the
-- incoming rows already exist. Checking 13 columns per row from the client
-- would be thousands of round-trips, so the candidate rows are sent once as
-- JSON and matched here against the same key as uq_barc_telecast_row.
--
-- Returns the number of incoming rows that already exist.
CREATE OR REPLACE FUNCTION barc_count_existing_rows(p_rows JSONB)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::INTEGER
      FROM jsonb_to_recordset(p_rows) AS r(
            region            TEXT,
            week              INTEGER,
            channel           TEXT,
            telecast_date     DATE,
            description_raw   TEXT,
            programme_theme   TEXT,
            programme_genre   TEXT,
            week_day          TEXT,
            start_time_sec    INTEGER,
            end_time_sec      INTEGER,
            length_raw        TEXT,
            length_sec        INTEGER,
            target            TEXT
      )
     WHERE EXISTS (
        SELECT 1 FROM barc_telecasts t
         WHERE t.region          = COALESCE(r.region, '')
           AND t.week            = COALESCE(r.week, -1)
           AND t.channel         = COALESCE(r.channel, '')
           AND t.telecast_date   = r.telecast_date
           AND t.description_raw = r.description_raw
           AND t.programme_theme = COALESCE(r.programme_theme, '')
           AND t.programme_genre = COALESCE(r.programme_genre, '')
           AND t.week_day        = COALESCE(r.week_day, '')
           AND t.start_time_sec  = COALESCE(r.start_time_sec, -1)
           AND t.end_time_sec    = COALESCE(r.end_time_sec, -1)
           AND t.length_raw      = COALESCE(r.length_raw, '')
           AND t.length_sec      = COALESCE(r.length_sec, -1)
           AND t.target          = r.target
     );
$$;

-- Deletes the existing rows that collide with the incoming batch, so an
-- "override" import can insert cleanly. Returns the number deleted.
CREATE OR REPLACE FUNCTION barc_delete_colliding_rows(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(p_rows) AS r(
            region            TEXT,
            week              INTEGER,
            channel           TEXT,
            telecast_date     DATE,
            description_raw   TEXT,
            programme_theme   TEXT,
            programme_genre   TEXT,
            week_day          TEXT,
            start_time_sec    INTEGER,
            end_time_sec      INTEGER,
            length_raw        TEXT,
            length_sec        INTEGER,
            target            TEXT
        )
    ), removed AS (
        DELETE FROM barc_telecasts t
         USING incoming r
         WHERE t.region          = COALESCE(r.region, '')
           AND t.week            = COALESCE(r.week, -1)
           AND t.channel         = COALESCE(r.channel, '')
           AND t.telecast_date   = r.telecast_date
           AND t.description_raw = r.description_raw
           AND t.programme_theme = COALESCE(r.programme_theme, '')
           AND t.programme_genre = COALESCE(r.programme_genre, '')
           AND t.week_day        = COALESCE(r.week_day, '')
           AND t.start_time_sec  = COALESCE(r.start_time_sec, -1)
           AND t.end_time_sec    = COALESCE(r.end_time_sec, -1)
           AND t.length_raw      = COALESCE(r.length_raw, '')
           AND t.length_sec      = COALESCE(r.length_sec, -1)
           AND t.target          = r.target
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER INTO v_deleted FROM removed;

    RETURN v_deleted;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE barc_sheets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE barc_descriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE barc_telecasts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE barc_movie_yearly_metrics  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "barc_sheets_select" ON barc_sheets;
CREATE POLICY "barc_sheets_select" ON barc_sheets
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "barc_sheets_insert" ON barc_sheets;
CREATE POLICY "barc_sheets_insert" ON barc_sheets
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_sheets_update" ON barc_sheets;
CREATE POLICY "barc_sheets_update" ON barc_sheets
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_sheets_delete" ON barc_sheets;
CREATE POLICY "barc_sheets_delete" ON barc_sheets
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));

DROP POLICY IF EXISTS "barc_descriptions_select" ON barc_descriptions;
CREATE POLICY "barc_descriptions_select" ON barc_descriptions
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "barc_descriptions_insert" ON barc_descriptions;
CREATE POLICY "barc_descriptions_insert" ON barc_descriptions
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_descriptions_update" ON barc_descriptions;
CREATE POLICY "barc_descriptions_update" ON barc_descriptions
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_descriptions_delete" ON barc_descriptions;
CREATE POLICY "barc_descriptions_delete" ON barc_descriptions
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));

DROP POLICY IF EXISTS "barc_telecasts_select" ON barc_telecasts;
CREATE POLICY "barc_telecasts_select" ON barc_telecasts
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "barc_telecasts_insert" ON barc_telecasts;
CREATE POLICY "barc_telecasts_insert" ON barc_telecasts
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_telecasts_update" ON barc_telecasts;
CREATE POLICY "barc_telecasts_update" ON barc_telecasts
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_telecasts_delete" ON barc_telecasts;
CREATE POLICY "barc_telecasts_delete" ON barc_telecasts
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));

DROP POLICY IF EXISTS "barc_yearly_select" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_select" ON barc_movie_yearly_metrics
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "barc_yearly_insert" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_insert" ON barc_movie_yearly_metrics
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_yearly_update" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_update" ON barc_movie_yearly_metrics
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));
DROP POLICY IF EXISTS "barc_yearly_delete" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_delete" ON barc_movie_yearly_metrics
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','editor'));

-- ── Storage bucket ───────────────────────────────────────────
-- Sheets are stored at barc-sheets/{sheet_id}/{filename}. Unlike the public
-- image/certificate buckets this one is private — BARC data is licensed and
-- should not be reachable by unauthenticated URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('barc-sheets', 'barc-sheets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "barc_sheets_storage_select" ON storage.objects;
CREATE POLICY "barc_sheets_storage_select" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'barc-sheets');

DROP POLICY IF EXISTS "barc_sheets_storage_insert" ON storage.objects;
CREATE POLICY "barc_sheets_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'barc-sheets'
        AND public.get_user_role(auth.uid()) IN ('admin','editor')
    );

DROP POLICY IF EXISTS "barc_sheets_storage_update" ON storage.objects;
CREATE POLICY "barc_sheets_storage_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'barc-sheets'
        AND public.get_user_role(auth.uid()) IN ('admin','editor')
    );

DROP POLICY IF EXISTS "barc_sheets_storage_delete" ON storage.objects;
CREATE POLICY "barc_sheets_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'barc-sheets'
        AND public.get_user_role(auth.uid()) IN ('admin','editor')
    );
