-- ============================================================
-- Phase 2.12 — people_with_stats
-- Per-person movie counts, computed in the database.
--
-- The People / Actors / Directors pages used to do this in the
-- browser: fetch all people, then walk movie_people in chunks of
-- 50 and movies in chunks of 200, awaiting each chunk in turn.
-- That is ~23 sequential round trips and ~6s before first paint.
-- This view does the same work in one query.
--
-- Language versions count once: "Baishey Srabon (Hindi)" and
-- "Baishey Srabon" are the same film, so titles are stripped of
-- their parenthetical marker before being counted DISTINCT —
-- matching normalizeMovieTitle() in src/lib/api/people.ts.
--
-- Depends on: 02_people.sql, 07_movie_people.sql, movies
-- Safe to re-run.
-- ============================================================

DROP VIEW IF EXISTS people_with_stats CASCADE;

CREATE VIEW people_with_stats AS
WITH credits AS (
    SELECT
        mp.person_id,
        mp.role,
        -- Strip "(Hindi)", "(Odiya)", … so versions collapse to one title.
        TRIM(REGEXP_REPLACE(m.title, '\s*\([^)]*\)', '', 'g')) AS base_title
    FROM movie_people mp
    JOIN movies m ON m.id = mp.movie_id
    WHERE m.title IS NOT NULL AND TRIM(m.title) <> ''
)
SELECT
    p.*,
    COUNT(DISTINCT c.base_title)                                        AS movies_count,
    COUNT(DISTINCT c.base_title) FILTER (WHERE c.role = 'Actor')        AS movies_as_actor,
    COUNT(DISTINCT c.base_title) FILTER (WHERE c.role = 'Director')     AS movies_as_director,
    -- The person cards preview up to three titles, so carry them here
    -- rather than making the client fetch movie_people a second time.
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.base_title), NULL)                AS movies_list
FROM people p
LEFT JOIN credits c ON c.person_id = p.id
GROUP BY p.id;

-- Supporting indexes for the join above.
CREATE INDEX IF NOT EXISTS idx_movie_people_person_id ON movie_people (person_id);
CREATE INDEX IF NOT EXISTS idx_movie_people_movie_id  ON movie_people (movie_id);
