-- =============================================
-- Database Reset Script
-- Use this to clean the database before running a fresh migration
-- =============================================

-- WARNING: This will delete ALL data from these tables!
-- Make sure you have a backup if needed.

-- Delete in dependency order (deepest children first)

-- 1. Notifications and preferences
DELETE FROM user_notification_preferences;
DELETE FROM notifications;
DELETE FROM notification_settings;

-- 2. Pending changes and approvals (dependent on movies)
DELETE FROM movie_pending_changes;
DELETE FROM movie_approvals;

-- 3. Rights data (dependent on movies and platforms)
DELETE FROM platform_rights;

-- 4. Movie relationships
DELETE FROM movie_people;

-- 5. Audit log (references all tables via record_id)
DELETE FROM audit_logs;

-- 6. Movies
DELETE FROM movies;

-- 7. Lookup data (optional — keep these to preserve reference data)
-- DELETE FROM people;
-- DELETE FROM platforms;
-- DELETE FROM production_houses;

-- Verify deletion
SELECT 'movies'                        AS table_name, COUNT(*) AS count FROM movies
UNION ALL
SELECT 'movie_people',                              COUNT(*) FROM movie_people
UNION ALL
SELECT 'movie_approvals',                           COUNT(*) FROM movie_approvals
UNION ALL
SELECT 'movie_pending_changes',                     COUNT(*) FROM movie_pending_changes
UNION ALL
SELECT 'platform_rights',                           COUNT(*) FROM platform_rights
UNION ALL
SELECT 'audit_logs',                                COUNT(*) FROM audit_logs
UNION ALL
SELECT 'notifications',                             COUNT(*) FROM notifications
UNION ALL
SELECT 'notification_settings',                     COUNT(*) FROM notification_settings
UNION ALL
SELECT 'user_notification_preferences',             COUNT(*) FROM user_notification_preferences
UNION ALL
SELECT 'people',                                    COUNT(*) FROM people
UNION ALL
SELECT 'platforms',                                 COUNT(*) FROM platforms
UNION ALL
SELECT 'production_houses',                         COUNT(*) FROM production_houses;

-- Expected results after reset:
-- movies:                        0
-- movie_people:                  0
-- movie_approvals:               0
-- movie_pending_changes:         0
-- platform_rights:               0
-- audit_logs:                    0
-- notifications:                 0
-- notification_settings:         0  (re-seeded when 16_notifications.sql runs)
-- user_notification_preferences: 0
-- people:                        (unchanged if not deleted)
-- platforms:                     (unchanged if not deleted)
-- production_houses:             (unchanged if not deleted)
