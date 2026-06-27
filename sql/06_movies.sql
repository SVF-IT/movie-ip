-- ============================================================
-- 06 — movies
-- Core film record with all rights fields, approval workflow,
-- audit triggers, and RLS.
-- Depends on: 00_extensions_and_helpers.sql, 14_audit_logs.sql
-- (audit_logs table must exist before the audit triggers fire)
-- ============================================================

CREATE TABLE IF NOT EXISTS movies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                VARCHAR(50),

-- Core
title VARCHAR(500) NOT NULL,
production_no VARCHAR(100),
source TEXT NOT NULL CHECK (
    source IN ('home_production', 'acquired')
),

-- Release (TEXT to support values like "UNRELEASED", "TBD")
release_date TEXT, release_year TEXT,

-- Classification
certification TEXT,
language TEXT,
production_house_name TEXT,
color_or_bw VARCHAR(20) DEFAULT 'Color',

-- Media
trailer_link TEXT, poster_url TEXT,

-- Acquired deal fields
assignor_licensor VARCHAR(255),
licensee VARCHAR(255),
agreement_date DATE,
agreement_start_date DATE,
agreement_end_date DATE,

-- Top-level satellite / internet date ranges
satellite_rights_start_date DATE,
satellite_rights_end_date DATE,
internet_rights_start_date DATE,
internet_rights_end_date DATE,

-- Syndication
syndication_internet_rights TEXT,

-- Internet rights sub-classification (comma-separated multi-select)
internet_rights_classification TEXT,

-- Primary Rights Yes/No flags
satellite_rights TEXT, -- 'Yes' / 'No'
internet_rights TEXT, -- 'Yes' / 'No'
negative_rights TEXT, -- 'Yes' / 'No'
other_rights TEXT, -- 'Yes' / 'No'

-- Sub-classifications (comma-separated)
-- satellite: "Pay TV", "Free TV", "Pay Per View", "DTH"
-- internet:  uses internet_rights_classification above
satellite_rights_classification TEXT,

-- Nature per right type
nature_of_satellite_rights TEXT,
nature_of_internet_rights TEXT,
nature_of_negative_rights TEXT,
nature_of_other_rights TEXT,

-- Per-right-type date ranges
negative_rights_start_date DATE,
negative_rights_end_date DATE,
other_rights_start_date DATE,
other_rights_end_date DATE,

-- Clip Rights
clip_rights TEXT, -- 'Yes' / 'No'
clip_rights_duration TEXT,

-- Holdbacks — format: "on VALUE1,VALUE2"
-- Options: "Audio Rights", "Theatrical Exploitation", "FVOD", "AVOD"
holdbacks TEXT,

-- Derivative rights
prequel_sequel_rights TEXT,
character_rights TEXT,
subtitling_rights TEXT,
dubbing_rights TEXT,

-- Movie-level nature (free text)
nature_of_rights TEXT,

-- Territory
territory TEXT,

-- Remarks / admin
remarks TEXT,
actionables TEXT,
wtp_library VARCHAR(20) DEFAULT 'WTP', -- 'WTP' | 'WTP/BD' | 'Library'
is_bangladeshi BOOLEAN NOT NULL DEFAULT FALSE,

-- Jointly produced extras
joint_prod_buy_back_date DATE,
revenue_share TEXT,
jointly_exploitation_rights TEXT,

-- Censorship
recensor_flag BOOLEAN NOT NULL DEFAULT FALSE,

-- Approval workflow
approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN (
        'pending',
        'approved',
        'rejected'
    )
),

-- Metadata
created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies USING gin (
    to_tsvector ('english', title)
);

CREATE INDEX IF NOT EXISTS idx_movies_source ON movies (source);

CREATE INDEX IF NOT EXISTS idx_movies_release_year ON movies (release_year);

CREATE INDEX IF NOT EXISTS idx_movies_approval ON movies (approval_status);

CREATE INDEX IF NOT EXISTS idx_movies_recensor ON movies (recensor_flag)
WHERE
    recensor_flag = TRUE;

CREATE INDEX IF NOT EXISTS idx_movies_sat_rights ON movies (satellite_rights);

CREATE INDEX IF NOT EXISTS idx_movies_int_rights ON movies (internet_rights);

CREATE INDEX IF NOT EXISTS idx_movies_neg_rights ON movies (negative_rights);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_movies_updated_at
    BEFORE UPDATE ON movies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
-- Requires: log_audit_event() defined in 14_audit_logs.sql
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
        CASE WHEN TG_OP = 'DELETE'              THEN NULL ELSE row_to_json(NEW)::jsonb END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_movies_insert AFTER INSERT ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_movies_update AFTER UPDATE ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_movies_delete AFTER DELETE ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movies_select" ON movies FOR
SELECT TO authenticated USING (true);

CREATE POLICY "movies_insert" ON movies FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

CREATE POLICY "movies_update" ON movies FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

-- separate policy that allows legal/admin to update approval_status
CREATE POLICY "movies_update_approval" ON movies FOR
UPDATE USING (
    EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE
            id = auth.uid ()
            AND role IN ('legal', 'admin')
    )
)
WITH
    CHECK (
        EXISTS (
            SELECT 1
            FROM user_profiles
            WHERE
                id = auth.uid ()
                AND role IN ('legal', 'admin')
        )
    );

CREATE POLICY "movies_delete" ON movies FOR DELETE TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
    OR (
        EXISTS (
            SELECT 1
            FROM user_profiles
            WHERE
                id = auth.uid ()
                AND role = 'editor'
        )
        AND approval_status != 'approved'
    )
);
