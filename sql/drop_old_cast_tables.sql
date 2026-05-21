-- ============================================================
-- Drop legacy movie_cast and movie_directors tables.
--
-- These were replaced by the unified movie_people table.
-- All frontend code uses movie_people exclusively.
-- Run only after confirming movie_people has all your data.
-- ============================================================

-- Safety check: view counts before dropping
-- SELECT 'movie_cast' AS tbl, COUNT(*) FROM movie_cast
-- UNION ALL
-- SELECT 'movie_directors', COUNT(*) FROM movie_directors
-- UNION ALL
-- SELECT 'movie_people', COUNT(*) FROM movie_people;

DROP TABLE IF EXISTS movie_cast;

DROP TABLE IF EXISTS movie_directors;
