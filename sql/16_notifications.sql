-- ============================================================
-- 16 — Notification System
-- Three tables:
--   notifications               — per-user in-app inbox
--   notification_settings       — admin-configurable global toggles
--   user_notification_preferences — per-user overrides
-- Depends on: 00_extensions_and_helpers.sql, 12_user_profiles.sql
-- ============================================================


-- ============================================================
-- notifications
-- In-app notification inbox. Each row is one notification
-- delivered to one user. Created by API routes and triggers.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    message       TEXT NOT NULL,
    type          TEXT NOT NULL,       -- maps to NotificationType values
    severity      TEXT NOT NULL DEFAULT 'info'
                      CHECK (severity IN ('info', 'warning', 'critical')),
    is_read       BOOLEAN NOT NULL DEFAULT FALSE,
    resource_type TEXT,                -- 'movie' | 'platform_right' | 'agreement' | …
    resource_id   UUID,               -- FK to the relevant record (loose reference)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user        ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread      ON notifications (user_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created     ON notifications (created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "notifications_select" ON notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Any authenticated caller (including server-side triggers) can insert
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Users can only update (mark as read) their own notifications
CREATE POLICY "notifications_update" ON notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- Users can delete their own notifications; admins can delete any
CREATE POLICY "notifications_delete" ON notifications
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        OR public.get_user_role(auth.uid()) = 'admin'
    );


-- ============================================================
-- notification_settings
-- Admin-controlled global on/off per notification type.
-- One row per NotificationType. Seeded below.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_settings (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_type TEXT NOT NULL UNIQUE,
    is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    description       TEXT NOT NULL,
    category          TEXT NOT NULL
                          CHECK (category IN ('alerts', 'activity', 'digest', 'account')),
    -- NULL means "all roles"; otherwise an array of role strings
    role_filters      TEXT[],
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_type ON notification_settings (notification_type);

CREATE TRIGGER trg_notification_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed to build "effective preferences" view)
CREATE POLICY "notification_settings_select" ON notification_settings
    FOR SELECT TO authenticated USING (true);

-- Only admins can change global settings
CREATE POLICY "notification_settings_write" ON notification_settings
    FOR ALL TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

-- ── Seed ─────────────────────────────────────────────────────
-- One row per NotificationType defined in notification-service.ts
INSERT INTO notification_settings
    (notification_type, is_enabled, description, category, role_filters)
VALUES
    ('rights_expiring_critical', TRUE,
     'Daily alert: rights expiring within 7 days',
     'alerts', ARRAY['admin','legal','editor']),

    ('rights_expiring_urgent',   TRUE,
     '30-day milestone alert for expiring rights',
     'alerts', ARRAY['admin','legal','editor']),

    ('rights_expiring_upcoming', TRUE,
     '90-day milestone alert for expiring rights',
     'alerts', ARRAY['admin','legal','editor']),

    ('agreement_created',        TRUE,
     'Notification when a new rights agreement is created',
     'activity', ARRAY['admin','legal','editor']),

    ('rights_renewed',           TRUE,
     'Notification when a platform right is renewed',
     'activity', ARRAY['admin','legal','editor']),

    ('rights_transferred',       TRUE,
     'Notification when a platform right is transferred',
     'activity', ARRAY['admin','legal','editor']),

    ('movie_created',            TRUE,
     'Notification when a new movie is added',
     'activity', ARRAY['admin','legal','editor']),

    ('daily_digest',             TRUE,
     'Daily summary email of activity and upcoming deadlines',
     'digest', NULL),

    ('recensor_reminder',        TRUE,
     'Monthly reminder for A-certified movies pending recensoring',
     'alerts', ARRAY['admin']),

    ('user_created',             TRUE,
     'Notification sent to new users when their account is created',
     'account', ARRAY['admin']),

    ('password_reset',           TRUE,
     'Password reset email — always sent, cannot be disabled by users',
     'account', NULL)

ON CONFLICT (notification_type) DO NOTHING;


-- ============================================================
-- user_notification_preferences
-- Per-user opt-in/out override on top of global settings.
-- If no row exists for a (user, type) pair the default is
-- "enabled" — users must explicitly opt out.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL
                          REFERENCES notification_settings(notification_type) ON DELETE CASCADE,
    is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user ON user_notification_preferences (user_id);

CREATE TRIGGER trg_user_notif_prefs_updated_at
    BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see and change their own preferences
CREATE POLICY "user_notif_prefs_select" ON user_notification_preferences
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "user_notif_prefs_insert" ON user_notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notif_prefs_update" ON user_notification_preferences
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "user_notif_prefs_delete" ON user_notification_preferences
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());
