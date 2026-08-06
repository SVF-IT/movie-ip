-- ============================================================
-- 30 — movie_censor_certificates
-- File attachments for movie censor certificates (hard-delete;
-- deleting a record also deletes its file from storage, handled
-- app-side before the DB delete).
-- A movie can have multiple certificates (new censor cert, adult
-- censor, revised cert, or any custom tag).
-- Depends on: 06_movies.sql, 12_user_profiles.sql, 14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS movie_censor_certificates (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id         UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    file_name        TEXT NOT NULL,
    file_path        TEXT NOT NULL,
    tag              TEXT,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movie_censor_certs_movie_id ON movie_censor_certificates (movie_id);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_movie_censor_certificates_updated_at
    BEFORE UPDATE ON movie_censor_certificates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Audit triggers ───────────────────────────────────────────
CREATE TRIGGER audit_movie_censor_certificates_insert AFTER INSERT ON movie_censor_certificates FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_movie_censor_certificates_update AFTER UPDATE ON movie_censor_certificates FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER audit_movie_censor_certificates_delete AFTER DELETE ON movie_censor_certificates FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movie_censor_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movie_censor_certs_select" ON movie_censor_certificates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "movie_censor_certs_insert" ON movie_censor_certificates
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));

CREATE POLICY "movie_censor_certs_update" ON movie_censor_certificates
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));

CREATE POLICY "movie_censor_certs_delete" ON movie_censor_certificates
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin','legal','editor'));

-- ── Storage bucket ───────────────────────────────────────────
-- Create a public bucket for censor certificate files (mirrors the
-- existing "images" bucket setup). Files are stored at
-- censor-certificates/{movie_id}/{timestamp}.{ext}; only the storage
-- path is persisted in movie_censor_certificates.file_path.
INSERT INTO storage.buckets (id, name, public)
VALUES ('censor-certificates', 'censor-certificates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "censor_certs_storage_select" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'censor-certificates');

CREATE POLICY "censor_certs_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'censor-certificates'
        AND public.get_user_role(auth.uid()) IN ('admin','legal','editor')
    );

CREATE POLICY "censor_certs_storage_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'censor-certificates'
        AND public.get_user_role(auth.uid()) IN ('admin','legal','editor')
    );

CREATE POLICY "censor_certs_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'censor-certificates'
        AND public.get_user_role(auth.uid()) IN ('admin','legal','editor')
    );
