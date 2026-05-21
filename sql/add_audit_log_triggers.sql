-- Audit Log Triggers for Film IP Manager
-- Run this after the main schema is set up
-- Automatically logs INSERT/UPDATE/DELETE operations on key tables

-- Create the trigger function
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE
      WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
      WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
      ELSE NULL
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN NULL
      ELSE row_to_json(NEW)::jsonb
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Movies triggers
DROP TRIGGER IF EXISTS audit_movies_insert ON movies;

CREATE TRIGGER audit_movies_insert
  AFTER INSERT ON movies
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_movies_update ON movies;

CREATE TRIGGER audit_movies_update
  AFTER UPDATE ON movies
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_movies_delete ON movies;

CREATE TRIGGER audit_movies_delete
  AFTER DELETE ON movies
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Platform Rights triggers
DROP TRIGGER IF EXISTS audit_platform_rights_insert ON platform_rights;

CREATE TRIGGER audit_platform_rights_insert
  AFTER INSERT ON platform_rights
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_platform_rights_update ON platform_rights;

CREATE TRIGGER audit_platform_rights_update
  AFTER UPDATE ON platform_rights
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_platform_rights_delete ON platform_rights;

CREATE TRIGGER audit_platform_rights_delete
  AFTER DELETE ON platform_rights
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Rights History triggers
DROP TRIGGER IF EXISTS audit_rights_history_insert ON rights_history;

CREATE TRIGGER audit_rights_history_insert
  AFTER INSERT ON rights_history
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- User Profiles triggers
DROP TRIGGER IF EXISTS audit_user_profiles_update ON user_profiles;

CREATE TRIGGER audit_user_profiles_update
  AFTER UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_user_profiles_insert ON user_profiles;

CREATE TRIGGER audit_user_profiles_insert
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Rights Agreements triggers
DROP TRIGGER IF EXISTS audit_rights_agreements_insert ON rights_agreements;

CREATE TRIGGER audit_rights_agreements_insert
  AFTER INSERT ON rights_agreements
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_rights_agreements_update ON rights_agreements;

CREATE TRIGGER audit_rights_agreements_update
  AFTER UPDATE ON rights_agreements
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_rights_agreements_delete ON rights_agreements;

CREATE TRIGGER audit_rights_agreements_delete
  AFTER DELETE ON rights_agreements
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Agreement Documents triggers
DROP TRIGGER IF EXISTS audit_agreement_documents_insert ON agreement_documents;

CREATE TRIGGER audit_agreement_documents_insert
  AFTER INSERT ON agreement_documents
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_agreement_documents_update ON agreement_documents;

CREATE TRIGGER audit_agreement_documents_update
  AFTER UPDATE ON agreement_documents
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- People triggers
DROP TRIGGER IF EXISTS audit_people_insert ON people;

CREATE TRIGGER audit_people_insert
  AFTER INSERT ON people
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_people_update ON people;

CREATE TRIGGER audit_people_update
  AFTER UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_people_delete ON people;

CREATE TRIGGER audit_people_delete
  AFTER DELETE ON people
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Platforms triggers
DROP TRIGGER IF EXISTS audit_platforms_insert ON platforms;

CREATE TRIGGER audit_platforms_insert
  AFTER INSERT ON platforms
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_platforms_update ON platforms;

CREATE TRIGGER audit_platforms_update
  AFTER UPDATE ON platforms
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_platforms_delete ON platforms;

CREATE TRIGGER audit_platforms_delete
  AFTER DELETE ON platforms
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Production Houses triggers
DROP TRIGGER IF EXISTS audit_production_houses_insert ON production_houses;

CREATE TRIGGER audit_production_houses_insert
  AFTER INSERT ON production_houses
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_production_houses_update ON production_houses;

CREATE TRIGGER audit_production_houses_update
  AFTER UPDATE ON production_houses
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS audit_production_houses_delete ON production_houses;

CREATE TRIGGER audit_production_houses_delete
  AFTER DELETE ON production_houses
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();
