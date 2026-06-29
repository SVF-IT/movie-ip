-- Migration 26: Fix movie_pending_changes visibility for editors
--
-- Problem: rows submitted when changed_by was NULL (profile not loaded)
-- are invisible to editors because the RLS policy checks changed_by = auth.uid()
-- which evaluates to NULL (not TRUE) when changed_by IS NULL.
--
-- Fix 1: backfill changed_by for existing rows by matching changed_by_name to user_profiles.full_name
-- Fix 2: update the RLS SELECT policy to also match on name as a fallback for legacy NULL rows

-- ── Step 1: Backfill changed_by from user_profiles where name matches ────────
UPDATE movie_pending_changes pc
SET changed_by = up.id
FROM user_profiles up
WHERE pc.changed_by IS NULL
  AND pc.changed_by_name IS NOT NULL
  AND pc.changed_by_name = up.full_name;

-- ── Step 2: Update RLS SELECT policy to handle remaining NULL changed_by rows ─
DROP POLICY IF EXISTS "pending_changes_select" ON movie_pending_changes;

CREATE POLICY "pending_changes_select" ON movie_pending_changes
    FOR SELECT TO authenticated USING (
        -- Normal case: changed_by is set
        changed_by = auth.uid()
        -- Fallback: changed_by is NULL but name matches the caller's profile
        OR (
            changed_by IS NULL
            AND changed_by_name = (
                SELECT full_name FROM user_profiles WHERE id = auth.uid()
            )
        )
        -- Admins and legal see everything
        OR public.current_user_role() IN ('admin', 'legal')
    );
