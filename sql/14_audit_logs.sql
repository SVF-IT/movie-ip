-- ============================================================
-- 14 — audit_logs
-- Central immutable log for all table mutations.
-- The log_audit_event() function is defined in 06_movies.sql
-- (it must exist before movies triggers are created).
-- This file creates the table + RLS only.
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES auth.users(id),
    action     VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id  UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_user    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table   ON audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admin / legal can read the audit trail
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','legal'));

-- Any authenticated trigger can insert (SECURITY DEFINER functions handle this)
CREATE POLICY "audit_logs_insert" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);
