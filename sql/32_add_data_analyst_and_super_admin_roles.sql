-- ============================================================
-- 32 — Add data_analyst and super_admin roles
--
--   • super_admin  — mirrors admin everywhere (distinct view/limits still TBD)
--   • data_analyst — editor-level permissions, plus BARC access
--
-- Also narrows BARC to admin / super_admin / data_analyst only. BARC data is
-- licensed, so editor, legal and viewer lose the read access they had before:
-- the barc_* SELECT policies were previously USING (true) for any authenticated
-- user, and the storage bucket was readable by all.
--
-- Safe to re-run (DROP POLICY IF EXISTS / idempotent constraint swap).
-- ============================================================

-- ── 1. Allow the new roles on user_profiles ──────────────────
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_role_check CHECK (
        role IN (
            'admin',
            'super_admin',
            'data_analyst',
            'legal',
            'viewer',
            'editor'
        )
    );

-- ── 2. Grant the new roles admin/editor-equivalent write access ──
-- Every existing policy spells out its allowed roles, so the new roles would be
-- silently denied without these helpers. Using functions keeps future role
-- changes to one place instead of dozens of inlined role lists.

-- True for admin-equivalent roles.
CREATE OR REPLACE FUNCTION public.is_admin_role(user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT public.get_user_role(user_id) IN ('admin', 'super_admin');
$$;

-- True for roles with editor-level write access (admin tier + editor + analyst).
CREATE OR REPLACE FUNCTION public.is_editor_role(user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT public.get_user_role(user_id) IN ('admin', 'super_admin', 'editor', 'data_analyst');
$$;

-- True for roles allowed to touch BARC at all.
CREATE OR REPLACE FUNCTION public.is_barc_role(user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT public.get_user_role(user_id) IN ('admin', 'super_admin', 'data_analyst');
$$;

-- ── 3. BARC tables — restrict reads, extend writes ───────────
-- SELECT was USING (true); it now matches the app-layer restriction.

DO $guard$ BEGIN
  IF to_regclass('public.barc_sheets') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_select" ON barc_sheets;
CREATE POLICY "barc_sheets_select" ON barc_sheets
    FOR SELECT TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_sheets') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_insert" ON barc_sheets;
CREATE POLICY "barc_sheets_insert" ON barc_sheets
    FOR INSERT TO authenticated WITH CHECK (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_sheets') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_update" ON barc_sheets;
CREATE POLICY "barc_sheets_update" ON barc_sheets
    FOR UPDATE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_sheets') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_delete" ON barc_sheets;
CREATE POLICY "barc_sheets_delete" ON barc_sheets
    FOR DELETE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_descriptions') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_descriptions_select" ON barc_descriptions;
CREATE POLICY "barc_descriptions_select" ON barc_descriptions
    FOR SELECT TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_descriptions') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_descriptions_insert" ON barc_descriptions;
CREATE POLICY "barc_descriptions_insert" ON barc_descriptions
    FOR INSERT TO authenticated WITH CHECK (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_descriptions') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_descriptions_update" ON barc_descriptions;
CREATE POLICY "barc_descriptions_update" ON barc_descriptions
    FOR UPDATE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_descriptions') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_descriptions_delete" ON barc_descriptions;
CREATE POLICY "barc_descriptions_delete" ON barc_descriptions
    FOR DELETE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_telecasts') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_telecasts_select" ON barc_telecasts;
CREATE POLICY "barc_telecasts_select" ON barc_telecasts
    FOR SELECT TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_telecasts') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_telecasts_insert" ON barc_telecasts;
CREATE POLICY "barc_telecasts_insert" ON barc_telecasts
    FOR INSERT TO authenticated WITH CHECK (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_telecasts') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_telecasts_update" ON barc_telecasts;
CREATE POLICY "barc_telecasts_update" ON barc_telecasts
    FOR UPDATE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_telecasts') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_telecasts_delete" ON barc_telecasts;
CREATE POLICY "barc_telecasts_delete" ON barc_telecasts
    FOR DELETE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_movie_yearly_metrics') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_yearly_select" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_select" ON barc_movie_yearly_metrics
    FOR SELECT TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_movie_yearly_metrics') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_yearly_insert" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_insert" ON barc_movie_yearly_metrics
    FOR INSERT TO authenticated WITH CHECK (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_movie_yearly_metrics') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_yearly_update" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_update" ON barc_movie_yearly_metrics
    FOR UPDATE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.barc_movie_yearly_metrics') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_yearly_delete" ON barc_movie_yearly_metrics;
CREATE POLICY "barc_yearly_delete" ON barc_movie_yearly_metrics
    FOR DELETE TO authenticated USING (public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

-- ── 4. BARC storage bucket — same restriction ────────────────
DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_storage_select" ON storage.objects;
CREATE POLICY "barc_sheets_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'barc-sheets' AND public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_storage_insert" ON storage.objects;
CREATE POLICY "barc_sheets_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'barc-sheets' AND public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_storage_update" ON storage.objects;
CREATE POLICY "barc_sheets_storage_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'barc-sheets' AND public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "barc_sheets_storage_delete" ON storage.objects;
CREATE POLICY "barc_sheets_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'barc-sheets' AND public.is_barc_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

-- ── 5. Core tables — admin-tier policies ─────────────────────
-- Policies spelled as "= 'admin'" would lock super_admin out entirely.

DO $guard$ BEGIN
  IF to_regclass('public.rights_nature_types') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "rights_nature_types_all" ON rights_nature_types;
CREATE POLICY "rights_nature_types_all" ON rights_nature_types
    FOR ALL TO authenticated USING (public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
CREATE POLICY "user_profiles_update" ON user_profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
CREATE POLICY "user_profiles_insert" ON user_profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() OR public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.notification_external_recipients') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "notification_recipients_admin" ON notification_external_recipients;
CREATE POLICY "notification_recipients_admin" ON notification_external_recipients
    FOR ALL TO authenticated
    USING (public.is_admin_role(auth.uid()))
    WITH CHECK (public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

-- ── 6. current_user_role() companions ────────────────────────
-- movie_pending_changes policies use current_user_role() (no argument) rather
-- than get_user_role(uuid). Give that path the same tier helpers.
CREATE OR REPLACE FUNCTION public.current_is_admin_role()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT public.current_user_role() IN ('admin', 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_is_editor_role()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
    SELECT public.current_user_role() IN ('admin', 'super_admin', 'editor', 'data_analyst');
$$;

-- ── 7. Core content tables ───────────────────────────────────
-- Every policy below inlined ('admin','legal','editor') or ('admin','legal'),
-- which silently denies super_admin and data_analyst. Re-pointed at the tier
-- helpers, preserving each policy's original intent:
--   • writes  = editor tier + legal   (data_analyst included)
--   • deletes/approvals = admin tier + legal, per the original policy
--   • admin-only         = admin tier  (super_admin included)

-- people: writes and deletes were all ('admin','legal','editor')
DO $guard$ BEGIN
  IF to_regclass('public.people') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "people_insert" ON people;
CREATE POLICY "people_insert" ON people FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.people') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "people_update" ON people;
CREATE POLICY "people_update" ON people FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.people') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "people_delete" ON people;
CREATE POLICY "people_delete" ON people FOR DELETE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- platforms: writes ('admin','legal','editor'), delete admin-only
DO $guard$ BEGIN
  IF to_regclass('public.platforms') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platforms_insert" ON platforms;
CREATE POLICY "platforms_insert" ON platforms FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.platforms') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platforms_update" ON platforms;
CREATE POLICY "platforms_update" ON platforms FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.platforms') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platforms_delete" ON platforms;
CREATE POLICY "platforms_delete" ON platforms FOR DELETE TO authenticated
    USING (public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

-- movies: writes ('admin','legal','editor')
DO $guard$ BEGIN
  IF to_regclass('public.movies') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movies_insert" ON movies;
CREATE POLICY "movies_insert" ON movies FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movies') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movies_update" ON movies;
CREATE POLICY "movies_update" ON movies FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- Approval status: admin tier + legal only. data_analyst is editor-shaped and
-- must NOT self-approve, so it is deliberately excluded here.
DO $guard$ BEGIN
  IF to_regclass('public.movies') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movies_update_approval_legal_admin" ON movies;
CREATE POLICY "movies_update_approval_legal_admin" ON movies FOR UPDATE
    USING (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal')
    WITH CHECK (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- platform_rights: writes editor tier + legal, delete admin tier + legal
DO $guard$ BEGIN
  IF to_regclass('public.platform_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platform_rights_insert" ON platform_rights;
CREATE POLICY "platform_rights_insert" ON platform_rights FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.platform_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platform_rights_update" ON platform_rights;
CREATE POLICY "platform_rights_update" ON platform_rights FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.platform_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "platform_rights_delete" ON platform_rights;
CREATE POLICY "platform_rights_delete" ON platform_rights FOR DELETE TO authenticated
    USING (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- movie_rights (Rights We Own)
DO $guard$ BEGIN
  IF to_regclass('public.movie_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_rights_insert" ON movie_rights;
CREATE POLICY "movie_rights_insert" ON movie_rights FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_rights_update" ON movie_rights;
CREATE POLICY "movie_rights_update" ON movie_rights FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_rights') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_rights_delete" ON movie_rights;
CREATE POLICY "movie_rights_delete" ON movie_rights FOR DELETE TO authenticated
    USING (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- movie_censor_certificates
DO $guard$ BEGIN
  IF to_regclass('public.movie_censor_certificates') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_censor_certs_insert" ON movie_censor_certificates;
CREATE POLICY "movie_censor_certs_insert" ON movie_censor_certificates FOR INSERT TO authenticated
    WITH CHECK (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_censor_certificates') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_censor_certs_update" ON movie_censor_certificates;
CREATE POLICY "movie_censor_certs_update" ON movie_censor_certificates FOR UPDATE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_censor_certificates') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "movie_censor_certs_delete" ON movie_censor_certificates;
CREATE POLICY "movie_censor_certs_delete" ON movie_censor_certificates FOR DELETE TO authenticated
    USING (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

-- censor-certificates storage bucket (select stays public, as before)
DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "censor_certs_storage_insert" ON storage.objects;
CREATE POLICY "censor_certs_storage_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'censor-certificates'
        AND (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal'));$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "censor_certs_storage_update" ON storage.objects;
CREATE POLICY "censor_certs_storage_update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'censor-certificates'
        AND (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal'));$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "censor_certs_storage_delete" ON storage.objects;
CREATE POLICY "censor_certs_storage_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'censor-certificates'
        AND (public.is_editor_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal'));$stmt$;
  END IF;
END $guard$;

-- audit_logs / notification_settings: admin tier + legal as before
DO $guard$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT TO authenticated
    USING (public.is_admin_role(auth.uid()) OR public.get_user_role(auth.uid()) = 'legal');$stmt$;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "notification_settings_write" ON notification_settings;
CREATE POLICY "notification_settings_write" ON notification_settings FOR ALL TO authenticated
    USING (public.is_admin_role(auth.uid()));$stmt$;
  END IF;
END $guard$;

-- movie_pending_changes: submissions from editor tier; approve/reject admin tier + legal
DO $guard$ BEGIN
  IF to_regclass('public.movie_pending_changes') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "pending_changes_select" ON movie_pending_changes;
CREATE POLICY "pending_changes_select" ON movie_pending_changes FOR SELECT TO authenticated
    USING (changed_by = auth.uid()
        OR changed_by IS NULL
        OR public.current_is_admin_role()
        OR public.current_user_role() = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_pending_changes') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "pending_changes_insert" ON movie_pending_changes;
CREATE POLICY "pending_changes_insert" ON movie_pending_changes FOR INSERT TO authenticated
    WITH CHECK (public.current_is_editor_role() OR public.current_user_role() = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_pending_changes') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "pending_changes_update" ON movie_pending_changes;
CREATE POLICY "pending_changes_update" ON movie_pending_changes FOR UPDATE TO authenticated
    USING (public.current_is_admin_role() OR public.current_user_role() = 'legal');$stmt$;
  END IF;
END $guard$;
DO $guard$ BEGIN
  IF to_regclass('public.movie_pending_changes') IS NOT NULL THEN
    EXECUTE $stmt$DROP POLICY IF EXISTS "pending_changes_delete" ON movie_pending_changes;
CREATE POLICY "pending_changes_delete" ON movie_pending_changes FOR DELETE TO authenticated
    USING (public.current_is_admin_role());$stmt$;
  END IF;
END $guard$;

-- ── 8. Notification role filters ─────────────────────────────
-- notification_settings.role_filters is matched with `role IN (...)` at send time,
-- so a role absent from the stored array receives nothing. super_admin mirrors
-- admin, so it inherits every notification admin already gets.
--
-- data_analyst is deliberately NOT backfilled: it is a new, narrower role, so an
-- admin opts it in per notification type from the settings page.
DO $guard$ BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    UPDATE notification_settings
    SET role_filters = array_append(role_filters, 'super_admin')
    WHERE role_filters IS NOT NULL
      AND 'admin' = ANY (role_filters)
      AND NOT ('super_admin' = ANY (role_filters));
  END IF;
END $guard$;
