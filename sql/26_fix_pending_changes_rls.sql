-- Migration 26: Fix movie_pending_changes visibility for editors
--
-- Problem: rows submitted when changed_by was NULL (profile not loaded)
-- are invisible to editors because the RLS policy checks changed_by = auth.uid()
-- which evaluates to NULL (not TRUE) when changed_by IS NULL.
--
-- Fix 1: backfill changed_by for existing rows by matching changed_by_name to user_profiles.full_name
-- Fix 2: update the RLS SELECT policy to also match on name as a fallback for legacy NULL rows

-- ── Step 1: Backfill changed_by from user_profiles where name matches ────────
-- (best-effort — trimmed, case-insensitive, and also tries matching against email
-- since the client falls back to email, or the literal "Editor", when the name
-- isn't available yet at submit time)
UPDATE movie_pending_changes pc
SET changed_by = up.id
FROM user_profiles up
WHERE pc.changed_by IS NULL
  AND pc.changed_by_name IS NOT NULL
  AND (
    lower(trim(pc.changed_by_name)) = lower(trim(up.full_name))
    OR lower(trim(pc.changed_by_name)) = lower(trim(up.email))
  );

-- ── Step 2: Update RLS SELECT policy to handle remaining NULL changed_by rows ─
-- Any row that still has changed_by IS NULL after the backfill above couldn't be
-- attributed to a specific user (e.g. name/email didn't match anything, or the
-- profile was renamed since). Rather than keep it permanently invisible via a
-- fragile name-match, let any authenticated editor see it — these are rare
-- legacy rows, not an ongoing pattern, since the client no longer submits with
-- changed_by: null going forward.
DROP POLICY IF EXISTS "pending_changes_select" ON movie_pending_changes;

CREATE POLICY "pending_changes_select" ON movie_pending_changes
    FOR SELECT TO authenticated USING (
        -- Normal case: changed_by is set
        changed_by = auth.uid()
        -- Fallback: legacy rows that couldn't be attributed to anyone
        OR changed_by IS NULL
        -- Admins and legal see everything
        OR public.current_user_role() IN ('admin', 'legal')
    );
