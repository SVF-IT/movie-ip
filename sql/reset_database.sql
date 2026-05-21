-- =============================================
-- Database Reset Script
-- Use this to clean the database before running a fresh migration
-- =============================================

-- WARNING: This will delete ALL data from these tables!
-- Make sure you have a backup if needed.

-- Delete in correct order to respect foreign key constraints

-- 1. Delete rights data (dependent on movies)
DELETE FROM rights_history;
DELETE FROM platform_rights;

-- 2. Delete movie relationships
DELETE FROM movie_cast;
DELETE FROM movie_directors;

-- 3. Delete movies
DELETE FROM movies;

-- 4. Delete lookup data (optional - keep these if you want to preserve platforms/people)
-- DELETE FROM people;
-- DELETE FROM platforms;
-- DELETE FROM rights_types;
-- DELETE FROM production_houses;
-- DELETE FROM languages;

-- 5. Reset sequences (optional - for clean IDs)
-- Note: We use UUIDs so this is not necessary

-- Verify deletion
SELECT 'movies' as table_name, COUNT(*) as count FROM movies
UNION ALL
SELECT 'platform_rights', COUNT(*) FROM platform_rights
UNION ALL
SELECT 'rights_history', COUNT(*) FROM rights_history
UNION ALL
SELECT 'movie_cast', COUNT(*) FROM movie_cast
UNION ALL
SELECT 'movie_directors', COUNT(*) FROM movie_directors
UNION ALL
SELECT 'people', COUNT(*) FROM people
UNION ALL
SELECT 'platforms', COUNT(*) FROM platforms
UNION ALL
SELECT 'rights_types', COUNT(*) FROM rights_types;

-- Expected results after reset:
-- movies: 0
-- platform_rights: 0
-- rights_history: 0
-- movie_cast: 0
-- movie_directors: 0
-- people: 0 (or existing count if not deleted)
-- platforms: 16 (or existing count if not deleted)
-- rights_types: 14 (or existing count if not deleted)
