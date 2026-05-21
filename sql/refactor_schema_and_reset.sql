BEGIN;

-- 1. DELETE ALL DATA
DELETE FROM rights_history;
DELETE FROM platform_rights;
DELETE FROM movie_cast;
DELETE FROM movie_directors;
DELETE FROM movies;
DELETE FROM people;
DELETE FROM production_houses;

-- 2. SCHEMA CHANGES
-- DROP ... CASCADE will drop dependent views (movies_with_details, available_for_rights)
ALTER TABLE movies DROP COLUMN IF EXISTS production_house_id CASCADE;
ALTER TABLE movies DROP COLUMN IF EXISTS language_id CASCADE;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE platform_rights DROP COLUMN IF EXISTS license_type CASCADE;
ALTER TABLE rights_history DROP COLUMN IF EXISTS license_type CASCADE;

-- DROP LANGUAGES TABLE
DROP TABLE IF EXISTS languages CASCADE;

-- 3. RECREATE VIEWS
-- Recreate movies_with_details
CREATE OR REPLACE VIEW movies_with_details AS
SELECT 
  m.*,
  (SELECT string_agg(p.name, ', ') 
   FROM movie_cast mc 
   JOIN people p ON mc.person_id = p.id 
   WHERE mc.movie_id = m.id) as cast_names,
  (SELECT string_agg(p.name, ', ') 
   FROM movie_directors md 
   JOIN people p ON md.person_id = p.id 
   WHERE md.movie_id = m.id) as director_names
FROM movies m;

-- Recreate available_for_rights
CREATE OR REPLACE VIEW available_for_rights AS
SELECT * FROM movies_with_details
WHERE id NOT IN (
  SELECT movie_id FROM platform_rights WHERE is_current = true
);

COMMIT;
