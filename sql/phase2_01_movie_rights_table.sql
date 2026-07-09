-- ============================================================
-- phase2_01 — movie_rights
-- Rights owned by SVF per acquired movie.
-- Each row = one nature entry for a right type on a movie.
-- The differentiating factor between rows with the same
-- movie_id + right_type is nature (and/or territory + dates).
--
-- Applies to acquired movies only. Home productions own all
-- rights by default and never get rows in this table.
--
-- Depends on: 06_movies.sql, 14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS movie_rights (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id       UUID NOT NULL REFERENCES movies (id) ON DELETE CASCADE,

    -- Right category: 'Satellite', 'Internet', 'Negative',
    -- 'Airborne', 'Ship', 'Other', etc.
    right_type     TEXT NOT NULL,

    -- Sub-classification within right type, comma-separated.
    -- e.g. 'Cable TV, DTH, Pay Rights'
    classification TEXT,

    -- Nature of rights. Constrained in the UI to:
    -- 'Exclusive', 'Non-Exclusive', 'Shared Exclusive', or custom text.
    nature         TEXT NOT NULL,

    territory      TEXT,
    start_date     DATE,        -- NULL = not yet determined
    end_date       DATE,        -- NULL = Perpetual

    syndication    TEXT,        -- 'Yes' / 'No' / free text
    holdbacks      TEXT,        -- free text, e.g. 'FVOD, Theatrical Exploitation'

    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    created_by     UUID,
    updated_by     UUID
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movie_rights_movie
    ON movie_rights (movie_id);

CREATE INDEX IF NOT EXISTS idx_movie_rights_type
    ON movie_rights (right_type);

CREATE INDEX IF NOT EXISTS idx_movie_rights_movie_type
    ON movie_rights (movie_id, right_type);

CREATE INDEX IF NOT EXISTS idx_movie_rights_nature
    ON movie_rights (nature);

CREATE INDEX IF NOT EXISTS idx_movie_rights_dates
    ON movie_rights (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_movie_rights_expiry
    ON movie_rights (end_date)
    WHERE end_date IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_movie_rights_updated_at
    BEFORE UPDATE ON movie_rights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
-- Reuses log_audit_event() defined in 06_movies.sql
CREATE TRIGGER audit_movie_rights_insert
    AFTER INSERT ON movie_rights
    FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_movie_rights_update
    AFTER UPDATE ON movie_rights
    FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_movie_rights_delete
    AFTER DELETE ON movie_rights
    FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movie_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movie_rights_select" ON movie_rights
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "movie_rights_insert" ON movie_rights
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role(auth.uid()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "movie_rights_update" ON movie_rights
    FOR UPDATE TO authenticated USING (
        public.get_user_role(auth.uid()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "movie_rights_delete" ON movie_rights
    FOR DELETE TO authenticated USING (
        public.get_user_role(auth.uid()) IN ('admin', 'legal')
    );
