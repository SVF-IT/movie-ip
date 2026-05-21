-- ============================================================
-- 02 — people
-- Unified actors + directors lookup.
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS people (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(255) NOT NULL,
    role TEXT DEFAULT NULL, -- 'actor' | 'director' | 'both'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- case-insensitive unique name
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_name_lower ON people (LOWER(TRIM(name)));

-- ── Trigger ──────────────────────────────────────────────────
CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON people
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_select" ON people FOR
SELECT TO authenticated USING (true);

CREATE POLICY "people_insert" ON people FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "people_update" ON people FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

CREATE POLICY "people_delete" ON people FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);
