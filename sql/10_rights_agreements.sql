-- ============================================================
-- 10 — rights_agreements
-- Platform-level agreement contracts with full financial,
-- territory, and legal fields.
-- Depends on: 03_platforms.sql, 08_platform_rights.sql,
--             14_audit_logs.sql
-- ============================================================


CREATE TABLE IF NOT EXISTS rights_agreements (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id UUID REFERENCES platforms(id),
    title       VARCHAR(255),
    summary     TEXT,

    start_date  DATE,
    end_date    DATE,
    signed_date DATE,

-- Financial
agreement_value NUMERIC,
currency VARCHAR(10) DEFAULT 'INR',
deal_type VARCHAR(50),
minimum_guarantee NUMERIC,
revenue_share_percent NUMERIC,
advance_payment NUMERIC,
royalty_rate NUMERIC,
payment_terms TEXT,
marketing_commitment NUMERIC,
delivery_cost NUMERIC,
commission_rate NUMERIC,
withholding_tax_rate NUMERIC,

-- Territory
territory VARCHAR(255) DEFAULT 'World',
territory_type VARCHAR(100),
excluded_territories TEXT,
sub_licensing_allowed BOOLEAN,
exclusivity VARCHAR(50),

-- Rights scope
content_type TEXT,
language_scope TEXT,
platforms_scope TEXT,
renewal_type TEXT,
renewal_terms TEXT,

-- Legal
counterparty_type TEXT,
governing_law TEXT,
dispute_resolution TEXT,
notice_period_days INTEGER,

-- Internal
business_unit TEXT,
cost_center TEXT,
priority TEXT,
internal_notes TEXT,
status VARCHAR(50) DEFAULT 'active',

-- AI-extracted
key_terms  TEXT[],
    ai_summary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rights_agreements_platform ON rights_agreements (platform_id);

CREATE INDEX IF NOT EXISTS idx_rights_agreements_status ON rights_agreements (status);

CREATE INDEX IF NOT EXISTS idx_rights_agreements_dates ON rights_agreements (start_date, end_date);

-- ── Wire platform_rights.agreement_id → rights_agreements ───
-- (platform_rights table was created without this FK in 08 to
--  avoid forward-reference; we add it here.)
ALTER TABLE platform_rights
ADD CONSTRAINT fk_platform_rights_agreement FOREIGN KEY (agreement_id) REFERENCES rights_agreements (id) ON DELETE SET NULL;

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_rights_agreements_updated_at
    BEFORE UPDATE ON rights_agreements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
CREATE TRIGGER audit_rights_agreements_insert AFTER INSERT ON rights_agreements FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_rights_agreements_update AFTER UPDATE ON rights_agreements FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE rights_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agreements_select" ON rights_agreements FOR
SELECT USING (true);

CREATE POLICY "agreements_insert" ON rights_agreements FOR
INSERT
WITH
    CHECK (
        EXISTS (
            SELECT 1
            FROM user_profiles
            WHERE
                id = auth.uid ()
                AND role IN ('admin', 'legal')
        )
    );

CREATE POLICY "agreements_update" ON rights_agreements FOR
UPDATE USING (
    EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE
            id = auth.uid ()
            AND role IN ('admin', 'legal')
    )
);

CREATE POLICY "agreements_delete" ON rights_agreements FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE
            id = auth.uid ()
            AND role = 'admin'
    )
);
