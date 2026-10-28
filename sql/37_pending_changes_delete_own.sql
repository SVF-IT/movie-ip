-- ============================================================
-- 37 — Let submitters delete their own pending change requests
--
-- An editor (or data_analyst) who raised a change by mistake can withdraw it
-- from My Submissions while it is still pending. Approved / rejected rows are
-- a reviewer's decision and stay as history.
--
-- Added alongside "pending_changes_delete" (admin tier, from 32); permissive
-- policies are OR'd, so admins keep their full delete access.
--
-- Depends on: 17_movie_pending_changes.sql. Safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "pending_changes_delete_own" ON movie_pending_changes;
CREATE POLICY "pending_changes_delete_own" ON movie_pending_changes
    FOR DELETE TO authenticated
    USING (changed_by = auth.uid() AND status = 'pending');
