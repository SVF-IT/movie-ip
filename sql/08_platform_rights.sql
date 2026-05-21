-- ============================================================
-- 08 — platform_rights
-- Per-platform right grants for a movie.
-- Depends on: 06_movies.sql, 03_platforms.sql, 04_rights_types.sql,
--             10_rights_agreements.sql (FK added after that table exists),
--             14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_rights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    movie_id UUID NOT NULL REFERENCES movies (id) ON DELETE CASCADE,
    agreement_id UUID, -- FK to rights_agreements added below
    platform_id UUID REFERENCES platforms (id),
    rights_type_id UUID REFERENCES rights_types (id),
    category VARCHAR(100),
    nature TEXT,
    start_date DATE,
    end_date DATE,
    territory VARCHAR(255) DEFAULT 'World',
    is_current BOOLEAN DEFAULT TRUE,
    is_expired BOOLEAN DEFAULT FALSE,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_platform_rights_movie ON platform_rights (movie_id);

CREATE INDEX IF NOT EXISTS idx_platform_rights_platform ON platform_rights (platform_id);

CREATE INDEX IF NOT EXISTS idx_platform_rights_dates ON platform_rights (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_platform_rights_expiry ON platform_rights (end_date)
WHERE
    is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_platform_rights_agreement ON platform_rights (agreement_id);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_platform_rights_updated_at
    BEFORE UPDATE ON platform_rights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
CREATE TRIGGER audit_platform_rights_insert AFTER INSERT ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_platform_rights_update AFTER UPDATE ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_platform_rights_delete AFTER DELETE ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE platform_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_rights_select" ON platform_rights FOR
SELECT TO authenticated USING (true);

CREATE POLICY "platform_rights_insert" ON platform_rights FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "platform_rights_update" ON platform_rights FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

CREATE POLICY "platform_rights_delete" ON platform_rights FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

-- NOTE: The FK constraint to rights_agreements is added in
-- 10_rights_agreements.sql after that table is created.
