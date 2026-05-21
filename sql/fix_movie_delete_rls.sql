-- Fix movies_delete policy using direct EXISTS check (same pattern as fix_approval_rls.sql)
-- get_user_role() returns null due to RLS recursion on user_profiles, so we bypass it.

DROP POLICY IF EXISTS "movies_delete" ON movies;

CREATE POLICY "movies_delete" ON movies
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'editor'
      )
      AND approval_status != 'approved'
    )
  );
