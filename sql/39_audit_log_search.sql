-- ============================================================
-- 39 — Audit log search
--
-- One function backs the Audit Log page: the table / action / date filters
-- plus a free-text search, returning the page of rows and the total count in
-- a single JSON value.
--
-- The search matches, case-insensitively, any of:
--   • the user who made the change — full name or email (user_profiles)
--   • the movie the entry belongs to — the movie row itself, or the movie_id
--     carried in old/new values (rights, change requests, censor, cast…)
--   • a name-like field in the logged values — title, name, full_name,
--     email, movie_title, person_name
--
-- p_include_system = false drops "System" entries — rows with no user_id,
-- written by triggers, cron jobs or service-role scripts rather than a person.
--
-- Access: SECURITY DEFINER with the audit_logs_select rule (admin tier or
-- legal) checked ONCE up front. As an invoker, RLS would call the role
-- lookup for every audit row, which is what timed out the BARC page (38).
-- Anyone else gets an empty result.
--
-- Depends on: 14_audit_logs.sql, 32_add_data_analyst_and_super_admin_roles.sql.
-- Safe to re-run.
-- ============================================================

-- An earlier version of this file had no p_include_system; drop it so the two
-- signatures cannot coexist and make calls ambiguous.
DROP FUNCTION IF EXISTS audit_log_search(TEXT, TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION audit_log_search(
    p_query     TEXT        DEFAULT NULL,
    p_tables    TEXT[]      DEFAULT NULL,
    p_actions   TEXT[]      DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to   TIMESTAMPTZ DEFAULT NULL,
    p_limit     INTEGER     DEFAULT 10000,
    p_include_system BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Wildcards in the user's text are matched literally.
    v_pattern TEXT := CASE
        WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL
        ELSE '%' || replace(replace(replace(BTRIM(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    END;
BEGIN
    IF NOT (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal') THEN
        RETURN jsonb_build_object('count', 0, 'rows', '[]'::jsonb);
    END IF;

    RETURN (
        WITH matched AS (
            SELECT a.*
              FROM audit_logs a
              LEFT JOIN user_profiles u ON u.id = a.user_id
              LEFT JOIN movies m
                ON m.id::TEXT = COALESCE(
                       a.new_values->>'movie_id',
                       a.old_values->>'movie_id',
                       CASE WHEN a.table_name = 'movies' THEN a.record_id::TEXT END)
             WHERE (p_tables    IS NULL OR a.table_name = ANY (p_tables))
               AND (p_actions   IS NULL OR a.action     = ANY (p_actions))
               AND (p_date_from IS NULL OR a.created_at >= p_date_from)
               AND (p_date_to   IS NULL OR a.created_at <= p_date_to)
               AND (p_include_system OR a.user_id IS NOT NULL)
               AND (v_pattern IS NULL
                    OR u.full_name ILIKE v_pattern
                    OR u.email     ILIKE v_pattern
                    OR m.title     ILIKE v_pattern
                    OR a.new_values->>'title'       ILIKE v_pattern
                    OR a.old_values->>'title'       ILIKE v_pattern
                    OR a.new_values->>'name'        ILIKE v_pattern
                    OR a.old_values->>'name'        ILIKE v_pattern
                    OR a.new_values->>'full_name'   ILIKE v_pattern
                    OR a.old_values->>'full_name'   ILIKE v_pattern
                    OR a.new_values->>'email'       ILIKE v_pattern
                    OR a.old_values->>'email'       ILIKE v_pattern
                    OR a.new_values->>'movie_title' ILIKE v_pattern
                    OR a.old_values->>'movie_title' ILIKE v_pattern
                    OR a.new_values->>'person_name' ILIKE v_pattern
                    OR a.old_values->>'person_name' ILIKE v_pattern)
        ),
        page AS (
            SELECT * FROM matched ORDER BY created_at DESC LIMIT p_limit
        )
        SELECT jsonb_build_object(
            'count', (SELECT COUNT(*) FROM matched),
            'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC) FROM page), '[]'::jsonb)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION audit_log_search(TEXT, TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION audit_log_search(TEXT, TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) TO authenticated;

-- Make the new function visible to PostgREST without a restart.
NOTIFY pgrst, 'reload schema';
