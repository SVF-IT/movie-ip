-- ============================================================
-- 09 — rights_history
-- Immutable log of right changes (renewals, transfers, expiry).
-- Depends on: 06_movies.sql, 03_platforms.sql, 04_rights_types.sql,
--             08_platform_rights.sql, 14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS rights_history (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id       UUID NOT NULL REFERENCES movies(id)         ON DELETE CASCADE,
    platform_id    UUID REFERENCES platforms(id),
    rights_type_id UUID REFERENCES rights_types(id),

    category   VARCHAR(100),
    nature     TEXT,
    start_date DATE,
    end_date   DATE,
    territory  VARCHAR(255),

    change_type  VARCHAR(50),       -- renewed | transferred | expired | modified
    change_date  TIMESTAMPTZ DEFAULT NOW(),
    new_right_id UUID REFERENCES platform_rights(id),

    remarks    TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rights_history_movie ON rights_history (movie_id);

-- ── Audit trigger ────────────────────────────────────────────
CREATE TRIGGER audit_rights_history_insert
    AFTER INSERT ON rights_history
    FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE rights_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rights_history_select" ON rights_history
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rights_history_insert" ON rights_history
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));
