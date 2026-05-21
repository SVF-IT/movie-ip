-- ============================================================
-- Audit triggers for movie_people (cast & crew linkages)
--
-- Uses a dedicated enriched trigger function so the audit log
-- stores human-readable movie title + person name instead of
-- raw UUIDs, making the audit log immediately understandable.
-- ============================================================

-- ── Enriched trigger function for movie_people ───────────────
CREATE OR REPLACE FUNCTION log_audit_movie_people()
RETURNS TRIGGER AS $$
DECLARE
  v_movie_title  TEXT;
  v_person_name  TEXT;
  v_row          RECORD;
  v_payload      JSONB;
BEGIN
  v_row := COALESCE(NEW, OLD);

  -- Resolve human-readable names
  SELECT title INTO v_movie_title  FROM movies  WHERE id = v_row.movie_id;
  SELECT name  INTO v_person_name  FROM people  WHERE id = v_row.person_id;

  v_payload := jsonb_build_object(
    'movie_id',    v_row.movie_id,
    'movie_title', COALESCE(v_movie_title, v_row.movie_id::text),
    'person_id',   v_row.person_id,
    'person_name', COALESCE(v_person_name, v_row.person_id::text),
    'role',        v_row.role,
    'billing_order', v_row.billing_order
  );

  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    TG_OP,
    'movie_people',
    v_row.id,
    CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN v_payload ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN v_payload ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Triggers ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_movie_people_insert ON movie_people;
CREATE TRIGGER audit_movie_people_insert
  AFTER INSERT ON movie_people
  FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();

DROP TRIGGER IF EXISTS audit_movie_people_delete ON movie_people;
CREATE TRIGGER audit_movie_people_delete
  AFTER DELETE ON movie_people
  FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();

DROP TRIGGER IF EXISTS audit_movie_people_update ON movie_people;
CREATE TRIGGER audit_movie_people_update
  AFTER UPDATE ON movie_people
  FOR EACH ROW EXECUTE FUNCTION log_audit_movie_people();
