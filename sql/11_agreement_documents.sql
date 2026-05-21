-- ============================================================
-- 11 — agreement_documents
-- File attachments for rights agreements (soft-delete).
-- Depends on: 10_rights_agreements.sql, 14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS agreement_documents (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id     UUID NOT NULL REFERENCES rights_agreements(id) ON DELETE CASCADE,
    file_name        TEXT NOT NULL,
    file_url         TEXT NOT NULL,
    file_type        VARCHAR(50),
    file_size        BIGINT,
    label            TEXT,
    uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_by_name TEXT,
    uploaded_at      TIMESTAMPTZ DEFAULT NOW(),
    replaced_by      UUID REFERENCES agreement_documents(id),
    is_deleted       BOOLEAN DEFAULT FALSE,
    deleted_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    deleted_by_name  TEXT,
    deleted_at       TIMESTAMPTZ
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agreement_docs_agreement ON agreement_documents (agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_docs_active    ON agreement_documents (agreement_id) WHERE is_deleted = FALSE;

-- ── Audit triggers ───────────────────────────────────────────
CREATE TRIGGER audit_agreement_documents_insert AFTER INSERT ON agreement_documents FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_agreement_documents_update AFTER UPDATE ON agreement_documents FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE agreement_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agreement_docs_select" ON agreement_documents
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "agreement_docs_insert" ON agreement_documents
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));

CREATE POLICY "agreement_docs_update" ON agreement_documents
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));

CREATE POLICY "agreement_docs_delete" ON agreement_documents
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','legal'));
