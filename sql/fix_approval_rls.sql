-- ─── Fix: Allow legal/admin to update approval_status on movies ───────────────
-- Problem: The movies table has RLS enabled, but no UPDATE policy existed that
-- allowed legal/admin users to change approval_status. The audit INSERT into
-- movie_approvals succeeded (it has its own permissive policy), but the
-- movies.approval_status UPDATE was silently blocked by RLS.
--
-- Run this in the Supabase SQL editor.

-- First, inspect your existing movies RLS policies with:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'movies';

-- Drop the policy if it was previously created incorrectly
DROP POLICY IF EXISTS "movies_update_approval_legal_admin" ON movies;

-- Allow legal and admin roles to update approval_status
-- This uses the user_profiles table (adjust table/column name if yours differs)
CREATE POLICY "movies_update_approval_legal_admin" ON movies
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('legal', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('legal', 'admin')
    )
  );

-- Verify: this should now show the new policy
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'movies' AND cmd = 'UPDATE';
