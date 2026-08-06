-- Migration 29: Collapse expiring-rights urgency tiers into one 2-week digest,
-- add a separate agreement-end-date digest for acquired movies, move the
-- recensor reminder to a 2-week cadence, add a pending-approvals reminder
-- every 2 days, remove the daily digest and agreement_created notifications
-- entirely, and add a retention-based cleanup function for the in-app
-- notifications inbox.

-- 1. Remove the old three-tier rights-expiring types (critical/urgent/upcoming),
--    replaced by a single rights_expiring_digest type.
DELETE FROM user_notification_preferences
    WHERE notification_type IN ('rights_expiring_critical', 'rights_expiring_urgent', 'rights_expiring_upcoming');
DELETE FROM notification_settings
    WHERE notification_type IN ('rights_expiring_critical', 'rights_expiring_urgent', 'rights_expiring_upcoming');

-- 2. Seed the two new notification types.
INSERT INTO notification_settings (notification_type, is_enabled, description, category, role_filters)
VALUES
    ('rights_expiring_digest', TRUE,
     'Every 2 weeks: summary of all platform rights expiring within 90 days',
     'alerts', ARRAY['admin','legal','editor']),
    ('agreement_end_reminder', TRUE,
     'Every 2 weeks: acquired-movie agreements ending within 90 days',
     'alerts', ARRAY['admin','legal','editor']),
    ('pending_approvals_reminder', TRUE,
     'Every 2 days: all movie change submissions still awaiting review',
     'alerts', ARRAY['admin','legal'])
ON CONFLICT (notification_type) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- 3. Update recensor_reminder's description for its new 2-week cadence
--    (now also sends email, not just in-app).
UPDATE notification_settings
    SET description = 'Every 2 weeks: A-certified movies pending re-censoring (recensor_flag = true)'
    WHERE notification_type = 'recensor_reminder';

-- 4. Remove the daily digest notification entirely (no daily email wanted).
DELETE FROM user_notification_preferences WHERE notification_type = 'daily_digest';
DELETE FROM notification_settings WHERE notification_type = 'daily_digest';

-- 5. Remove agreement_created: never implemented in code, and now redundant
--    with pending_approvals_reminder, which already covers new/changed
--    rights via the movie_pending_changes review flow.
DELETE FROM user_notification_preferences WHERE notification_type = 'agreement_created';
DELETE FROM notification_settings WHERE notification_type = 'agreement_created';

-- 6. Notifications inbox retention cleanup — deletes rows older than 30 days
--    regardless of read status. Invoked by a Vercel Cron API route
--    (/api/notifications/cleanup), not pg_cron, to match the rest of the app's
--    scheduling approach.
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(retention_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM notifications
        WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
