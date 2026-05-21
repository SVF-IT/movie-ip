-- ============================================================
-- 04 — rights_types
-- Lookup table for right categories (Satellite TV, SVOD, …).
-- Depends on: 00_extensions_and_helpers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS rights_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger ──────────────────────────────────────────────────
CREATE TRIGGER trg_rights_types_updated_at
    BEFORE UPDATE ON rights_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE rights_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rights_types_select" ON rights_types FOR
SELECT TO authenticated USING (true);

CREATE POLICY "rights_types_write" ON rights_types FOR ALL TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

-- ── Seed ─────────────────────────────────────────────────────
INSERT INTO
    rights_types (name, description)
VALUES (
        'Satellite TV',
        'Television broadcasting rights'
    ),
    (
        'DTH VOD',
        'Direct-to-home video on demand'
    ),
    (
        'Terrestrial TV',
        'Over-the-air broadcasting'
    ),
    (
        'SVOD',
        'Subscription video on demand'
    ),
    (
        'AVOD',
        'Advertising-based video on demand'
    ),
    (
        'TVOD',
        'Transactional video on demand'
    ),
    (
        'FVOD',
        'Free video on demand'
    ),
    (
        'Cable TV',
        'Cable television rights'
    ),
    (
        'Mobile Rights',
        'Mobile platform rights'
    ),
    (
        'Air Rights',
        'In-flight entertainment'
    ),
    (
        'Ship Rights',
        'Cruise/ship entertainment'
    ),
    (
        'Surface Rights',
        'Bus/train entertainment'
    ),
    (
        'Hotel Rights',
        'Hotel in-room entertainment'
    ),
    (
        'Other Rights',
        'Miscellaneous rights'
    ) ON CONFLICT (name) DO NOTHING;
