-- ============================================================
-- 28 — External Notification Recipients
-- Admin-managed contacts (name + email, no login account) who
-- can receive notification emails alongside internal app users
-- (e.g. distributors/press for movie anniversary milestones).
-- External contacts get EMAIL ONLY — the in-app notifications
-- table has a hard FK to auth.users, so it cannot target them.
-- Depends on: 00_extensions_and_helpers.sql, 16_notifications.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_external_recipients (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name               TEXT NOT NULL,
    email              TEXT NOT NULL,
    tag                TEXT,               -- optional free-text label, e.g. "Distributor", "Press"
    -- Which notification_type values this contact should receive.
    -- Validated against notification_settings.notification_type at the
    -- application layer (arrays can't carry a real FK).
    notification_types TEXT[] NOT NULL DEFAULT '{}',
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_notification_external_recipients_types
    ON notification_external_recipients USING GIN (notification_types);

CREATE TRIGGER trg_notification_external_recipients_updated_at
    BEFORE UPDATE ON notification_external_recipients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE notification_external_recipients ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (mirrors notification_settings —
-- needed so server-side recipient resolution can run under any
-- authenticated session, not just admin).
CREATE POLICY "notification_external_recipients_select"
    ON notification_external_recipients FOR SELECT
    TO authenticated USING (true);

-- Only admins can manage the external contact list
CREATE POLICY "notification_external_recipients_write"
    ON notification_external_recipients FOR ALL
    TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin')
    WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
