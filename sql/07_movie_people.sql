-- ============================================================
-- 07 — movie_people
-- Unified cast + directors junction (replaces old movie_cast
-- and movie_directors tables).
-- Depends on: 06_movies.sql, 02_people.sql, 14_audit_logs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS movie_people (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id      UUID NOT NULL REFERENCES movies(id)  ON DELETE CASCADE,
    person_id     UUID NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('Actor', 'Director')),
    billing_order INTEGER,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (movie_id, person_id, role)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movie_people_movie  ON movie_people (movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_people_person ON movie_people (person_id);
CREATE INDEX IF NOT EXISTS idx_movie_people_role   ON movie_people (role);

-- ── Audit trigger (enriched — stores human-readable names) ───
CREATE OR REPLACE FUNCTION log_audit_movie_people()
RETURNS TRIGGER AS $$
DECLARE
    v_movie_title TEXT;
    v_person_name TEXT;
    v_row         RECORD;
    v_payload     JSONB;
BEGIN
    v_row := COALESCE(NEW, OLD);
    SELECT title INTO v_movie_title FROM movies WHERE id = v_row.movie_id;
    SELECT name  INTO v_person_name FROM people WHERE id = v_row.person_id;
    v_payload := jsonb_build_object(
        'movie_id',      v_row.movie_id,
        'movie_title',   COALESCE(v_movie_title, v_row.movie_id::text),
        'person_id',     v_row.person_id,
        'person_name',   COALESCE(v_person_name, v_row.person_id::text),
        'role',          v_row.role,
        'billing_order', v_row.billing_order
    );
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
        auth.uid(), TG_OP, 'movie_people', v_row.id,
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN v_payload ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN v_payload ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_movie_people_insert AFTER INSERT ON movie_people FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();
CREATE TRIGGER audit_movie_people_update AFTER UPDATE ON movie_people FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();
CREATE TRIGGER audit_movie_people_delete AFTER DELETE ON movie_people FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movie_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movie_people_select" ON movie_people
    FOR SELECT USING (true);

CREATE POLICY "movie_people_write" ON movie_people
    FOR ALL
    USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','legal','editor')));
