-- ============================================================
-- 05 — rights_nature_types
-- Lookup for right nature (Exclusive, Non-Exclusive, …).
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS rights_nature_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger ──────────────────────────────────────────────────
-- (uses the shared update_updated_at_column — no separate trigger needed
--  in schema_current_state; add one here for completeness)
CREATE TRIGGER trg_rights_nature_types_updated_at
    BEFORE UPDATE ON rights_nature_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE rights_nature_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nature_types_select" ON rights_nature_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "nature_types_write" ON rights_nature_types
    FOR ALL TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

-- ── Seed ─────────────────────────────────────────────────────
INSERT INTO rights_nature_types (name, description) VALUES
    ('Exclusive',          'Exclusive rights'),
    ('Non-Exclusive',      'Non-exclusive rights'),
    ('Shared Exclusive',   'Shared exclusive rights'),
    ('Jointly Production', 'Jointly produced / co-production'),
    ('Sold/Expired',       'Rights sold or expired'),
    ('N/A',                'Not applicable')
ON CONFLICT (name) DO NOTHING;
