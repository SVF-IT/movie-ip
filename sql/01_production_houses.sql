-- ============================================================
-- 01 — production_houses
-- Lookup table for production company names.
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS production_houses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger ──────────────────────────────────────────────────
CREATE TRIGGER trg_production_houses_updated_at
    BEFORE UPDATE ON production_houses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE production_houses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_houses_select" ON production_houses FOR
SELECT TO authenticated USING (true);

CREATE POLICY "production_houses_insert" ON production_houses FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "production_houses_update" ON production_houses FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

CREATE POLICY "production_houses_delete" ON production_houses FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);
