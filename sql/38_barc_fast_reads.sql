-- ============================================================
-- 38 — Server-side reads for the BARC page
--
-- The page used to download every barc_telecasts row (1000 per request, one
-- request after another) to build the filter dropdowns and the per-movie
-- metrics in the browser. These two functions do the same work in Postgres
-- and return a single JSON value each, so the page makes one request per
-- read and PostgREST's 1000-row cap never applies.
--
-- barc_movie_metrics mirrors computeBarcMetrics in src/lib/barc/metrics.ts
-- exactly; change both together.
--
-- Access: both are SECURITY DEFINER and check is_barc_role(auth.uid()) ONCE
-- up front, returning empty results otherwise — the same rows the
-- barc_telecasts_select policy allows. Running as invoker instead made RLS
-- call is_barc_role for every row of every scan, which hit Supabase's
-- statement timeout. (movies is readable by every authenticated user, so
-- reading it here widens nothing.)
--
-- Depends on: 31_barc.sql. Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION barc_filter_options()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_barc_role(auth.uid()) THEN
        RETURN jsonb_build_object('years', '[]'::jsonb, 'targets', '[]'::jsonb,
            'channels', '[]'::jsonb, 'regions', '[]'::jsonb, 'weeks', '[]'::jsonb);
    END IF;

    RETURN jsonb_build_object(
        'years',    COALESCE((SELECT jsonb_agg(v ORDER BY v DESC) FROM (SELECT DISTINCT telecast_year AS v FROM barc_telecasts WHERE telecast_year IS NOT NULL) s), '[]'::jsonb),
        'targets',  COALESCE((SELECT jsonb_agg(v) FROM (SELECT DISTINCT target  AS v FROM barc_telecasts) s), '[]'::jsonb),
        'channels', COALESCE((SELECT jsonb_agg(v) FROM (SELECT DISTINCT channel AS v FROM barc_telecasts) s), '[]'::jsonb),
        'regions',  COALESCE((SELECT jsonb_agg(v) FROM (SELECT DISTINCT region  AS v FROM barc_telecasts) s), '[]'::jsonb),
        'weeks',    COALESCE((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT week AS v FROM barc_telecasts) s), '[]'::jsonb)
    );
END;
$$;

-- NULL for any parameter means "no filter on that column".
CREATE OR REPLACE FUNCTION barc_movie_metrics(
    p_year      INTEGER DEFAULT NULL,
    p_target    TEXT    DEFAULT NULL,
    p_channel   TEXT    DEFAULT NULL,
    p_region    TEXT    DEFAULT NULL,
    p_week      INTEGER DEFAULT NULL,
    p_movie_id  UUID    DEFAULT NULL,
    p_sheet_id  UUID    DEFAULT NULL,
    p_date_from DATE    DEFAULT NULL,
    p_date_to   DATE    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_barc_role(auth.uid()) THEN
        RETURN '[]'::jsonb;
    END IF;

    RETURN (
    WITH f AS (
        SELECT movie_id, description_raw, channel, week, telecast_date, week_day,
               start_time_sec, end_time_sec, target, rat_pct, daily_avg_rch_pct,
               ats_sec, grp
          FROM barc_telecasts
         WHERE movie_id IS NOT NULL
           AND (p_year      IS NULL OR telecast_year = p_year)
           AND (p_target    IS NULL OR target        = p_target)
           AND (p_channel   IS NULL OR channel       = p_channel)
           AND (p_region    IS NULL OR region        = p_region)
           AND (p_week      IS NULL OR week          = p_week)
           AND (p_movie_id  IS NULL OR movie_id      = p_movie_id)
           AND (p_sheet_id  IS NULL OR sheet_id      = p_sheet_id)
           AND (p_date_from IS NULL OR telecast_date >= p_date_from)
           AND (p_date_to   IS NULL OR telecast_date <= p_date_to)
    ),
    -- Weekly-first: average rat% and summed GRP within each week. AVG/SUM skip
    -- NULLs and return NULL for a week with none, which the outer AVG skips.
    weekly AS (
        SELECT movie_id, week, AVG(rat_pct) AS week_rating, SUM(grp) AS week_grp
          FROM f
         GROUP BY movie_id, week
    ),
    by_week AS (
        SELECT movie_id,
               COUNT(*)         AS week_count,
               AVG(week_rating) AS rating,
               AVG(week_grp)    AS grp
          FROM weekly
         GROUP BY movie_id
    ),
    -- NIMS: distinct airings, keyed on week + date + day + start + end + target.
    airings AS (
        SELECT movie_id, COUNT(*) AS nims
          FROM (SELECT DISTINCT movie_id, week, telecast_date, week_day,
                                start_time_sec, end_time_sec, target
                  FROM f) a
         GROUP BY movie_id
    ),
    -- ATS weighted by reach; rows with no ATS or no reach contribute nothing.
    ats AS (
        SELECT movie_id,
               SUM(ats_sec * daily_avg_rch_pct) / NULLIF(SUM(daily_avg_rch_pct), 0) AS weighted_ats_sec
          FROM f
         WHERE ats_sec IS NOT NULL AND daily_avg_rch_pct > 0
         GROUP BY movie_id
    ),
    descs AS (
        SELECT movie_id, jsonb_agg(description_raw) AS descriptions
          FROM (SELECT DISTINCT movie_id, description_raw FROM f WHERE description_raw <> '') d
         GROUP BY movie_id
    ),
    chans AS (
        SELECT movie_id, jsonb_agg(channel) AS channels
          FROM (SELECT DISTINCT movie_id, channel FROM f WHERE channel <> '') c
         GROUP BY movie_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'movie_id',              w.movie_id,
               'title',                 COALESCE(mv.title, 'Unknown movie'),
               'descriptions',          COALESCE(d.descriptions, '[]'::jsonb),
               'source',                mv.source,
               'certification',         mv.certification,
               'release_date',          mv.release_date,
               'language',              mv.language,
               'production_house_name', mv.production_house_name,
               'channels',              COALESCE(c.channels, '[]'::jsonb),
               'weekCount',             w.week_count,
               'nims',                  a.nims,
               'grp',                   w.grp::DOUBLE PRECISION,
               'rating',                w.rating::DOUBLE PRECISION,
               'weighted_ats_sec',      t.weighted_ats_sec::DOUBLE PRECISION
           )), '[]'::jsonb)
      FROM by_week w
      JOIN airings a USING (movie_id)
      LEFT JOIN ats   t USING (movie_id)
      LEFT JOIN descs d USING (movie_id)
      LEFT JOIN chans c USING (movie_id)
      LEFT JOIN movies mv ON mv.id = w.movie_id
    );
END;
$$;

REVOKE ALL ON FUNCTION barc_filter_options() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION barc_movie_metrics(INTEGER, TEXT, TEXT, TEXT, INTEGER, UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION barc_filter_options() TO authenticated;
GRANT EXECUTE ON FUNCTION barc_movie_metrics(INTEGER, TEXT, TEXT, TEXT, INTEGER, UUID, UUID, DATE, DATE) TO authenticated;

-- Make the new functions visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
