-- Migration 25: Remove unused notification types, fix category constraint, add special_events

-- Remove rights_renewed and rights_transferred (features removed)
DELETE FROM user_notification_preferences WHERE notification_type IN ('rights_renewed', 'rights_transferred');
DELETE FROM notification_settings WHERE notification_type IN ('rights_renewed', 'rights_transferred');

-- Fix category CHECK constraint to include special_events
ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_category_check;
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('alerts', 'activity', 'digest', 'account', 'special_events'));

-- Ensure anniversary_notification row exists with correct category
INSERT INTO notification_settings (notification_type, is_enabled, description, category, role_filters)
VALUES (
    'anniversary_notification',
    TRUE,
    'Email + banner for upcoming movie anniversaries (1yr, 5yr, 10yr…)',
    'special_events',
    NULL
)
ON CONFLICT (notification_type) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category;
