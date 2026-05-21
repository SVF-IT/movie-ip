-- ============================================================
-- 03 — platforms
-- Streaming / broadcast platforms.
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS platforms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(255) NOT NULL UNIQUE,
    platform_type VARCHAR(100), -- SVOD, AVOD, TVOD, Satellite, DTH …
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger ──────────────────────────────────────────────────
CREATE TRIGGER trg_platforms_updated_at
    BEFORE UPDATE ON platforms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platforms_select" ON platforms FOR
SELECT TO authenticated USING (true);

CREATE POLICY "platforms_insert" ON platforms FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "platforms_update" ON platforms FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

CREATE POLICY "platforms_delete" ON platforms FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- ── Seed ─────────────────────────────────────────────────────
INSERT INTO
    platforms (name, platform_type)
VALUES ('Viacom', 'Satellite TV'),
    ('Star', 'Satellite TV'),
    ('Echo', 'Satellite TV'),
    ('Prime Video', 'SVOD'),
    ('Hotstar', 'SVOD'),
    ('Viacom 18', 'SVOD'),
    ('Hoichoi', 'SVOD'),
    ('YouTube', 'AVOD'),
    ('Echo', 'DTH VOD'),
    ('Star', 'DTH VOD'),
    ON CONFLICT (name) DO NOTHING;
