-- ============================================================
-- 20 — Backfill is_current: set to false where end_date has passed
-- Also add a DB trigger to keep is_current accurate on insert/update
-- Run once on the live DB.
-- ============================================================

-- Step 1: Fix existing stale rows
UPDATE platform_rights
SET is_current = FALSE,
    updated_at = NOW()
WHERE end_date IS NOT NULL
  AND end_date < CURRENT_DATE
  AND is_current = TRUE;

-- Step 2: Trigger function — auto-set is_current on insert or update
CREATE OR REPLACE FUNCTION public.sync_is_current()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_current := (NEW.end_date IS NULL OR NEW.end_date >= CURRENT_DATE);
  RETURN NEW;
END;
$$;

-- Step 3: Attach trigger to platform_rights
DROP TRIGGER IF EXISTS trg_sync_is_current ON platform_rights;
CREATE TRIGGER trg_sync_is_current
  BEFORE INSERT OR UPDATE OF end_date ON platform_rights
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_current();
