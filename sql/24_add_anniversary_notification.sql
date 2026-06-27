-- Migration 24: Add anniversary_notification to notification_settings
-- Powers the Special Events banner on the Movies page.
-- category 'special_events' — visible to all roles, enabled by default.

INSERT INTO notification_settings (notification_type, is_enabled, description, category, role_filters)
VALUES (
    'anniversary_notification',
    TRUE,
    'Special Events banner on Movies page showing upcoming anniversaries and jubilees',
    'special_events',
    NULL
)
ON CONFLICT (notification_type) DO NOTHING;
