-- ============================================================
-- 12 — user_profiles
-- Extends Supabase auth.users with role / department info.
-- Depends on: 00_extensions_and_helpers.sql
-- Note: get_user_role() in 00 references this table — that
-- function is created after this table runs.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    employee_id VARCHAR(50),
    role TEXT DEFAULT 'viewer' CHECK (
        role IN (
            'admin',
            'legal',
            'viewer',
            'editor'
        )
    ),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles (role);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper — reads role bypassing RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Users can read their own profile; admins can read all
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.current_user_role() = 'admin'
  );

-- Only admins can insert / update / delete profiles
CREATE POLICY "user_profiles_admin_all" ON user_profiles
  FOR ALL USING (
    public.current_user_role() = 'admin'
  );

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.must_change_password IS 'When true, user must change password on next login. Set to true when admin creates account with temporary password.';

-- ------------------------------------------------------------
-- get_user_role — used by RLS policies across all tables
-- Defined here so it is available when 06_movies.sql etc run.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
    SELECT role FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── Audit triggers ───────────────────────────────────────────
CREATE TRIGGER audit_user_profiles_insert AFTER INSERT ON user_profiles FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER audit_user_profiles_update AFTER UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION log_audit_event();
