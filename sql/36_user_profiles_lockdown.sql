-- ============================================================
-- 36 — Lock down user_profiles
--
--   • admin and super_admin can read, create, update and delete any profile.
--   • Everyone else can read their own profile and edit their own row, but
--     cannot change role, is_active or must_change_password.
--
-- Fixes a privilege escalation: "user_profiles_update" (from 32) allowed
-- UPDATE on your own row with no WITH CHECK, and permissive policies are
-- OR'd, so any user could set their own role to 'admin'.
--
-- must_change_password is now cleared only by /api/auth/change-password
-- (service role), after the password update succeeds.
--
-- Also replaces the hard-coded role = 'admin' checks with is_admin_role(),
-- so super_admin can manage users too.
--
-- Depends on: 12_user_profiles.sql, 32 (is_admin_role). Safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own_fields" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_admin_update" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_admin_all" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;

-- Own profile, or every profile for the admin tier
CREATE POLICY "user_profiles_select" ON user_profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin_role(auth.uid()));

-- Admin tier: full control over every profile
CREATE POLICY "user_profiles_admin_all" ON user_profiles
    FOR ALL TO authenticated
    USING (public.is_admin_role(auth.uid()))
    WITH CHECK (public.is_admin_role(auth.uid()));

-- Everyone: edit your own row, but role / is_active / must_change_password
-- must stay as they were. The subqueries see the row as it was before this
-- UPDATE (statement snapshot), so they compare against the old values.
CREATE POLICY "user_profiles_update_own_fields" ON user_profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role IS NOT DISTINCT FROM (
            SELECT p.role FROM user_profiles p WHERE p.id = auth.uid()
        )
        AND is_active IS NOT DISTINCT FROM (
            SELECT p.is_active FROM user_profiles p WHERE p.id = auth.uid()
        )
        AND must_change_password IS NOT DISTINCT FROM (
            SELECT p.must_change_password FROM user_profiles p WHERE p.id = auth.uid()
        )
    );

-- No self-insert: profiles are created by /api/admin/create-user (service role)
-- or by the admin tier through user_profiles_admin_all.
