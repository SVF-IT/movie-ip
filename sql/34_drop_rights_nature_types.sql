-- ============================================================
-- 34 — drop rights_nature_types
--
-- The lookup table is gone from the app. NatureSelector now renders a fixed
-- canonical list (src/components/forms/nature-selector.tsx), because the table
-- was only ever intersected with that list — and an option silently vanished
-- whenever the stored spelling differed. 'Shared-Exclusive' was invisible for
-- exactly that reason, seeded here as 'Shared Exclusive' with a space.
--
-- platform_rights.nature is plain TEXT with no foreign key to this table, so
-- dropping it does not touch any rights data.
--
-- Run 33_normalize_rights_nature.sql FIRST if you have not already: it
-- canonicalises the stored values and does read this table.
--
-- Depends on: 33_normalize_rights_nature.sql
-- Idempotent: safe to run more than once.
-- ============================================================

BEGIN;

-- Confirm nothing references the table before removing it. Any foreign key
-- pointing here would make the DROP fail below rather than silently cascade;
-- that is deliberate — losing referencing rows should never be automatic.
DO $$
DECLARE
  ref_count INT;
BEGIN
  SELECT COUNT(*) INTO ref_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'rights_nature_types';

  IF ref_count > 0 THEN
    RAISE EXCEPTION
      'rights_nature_types still has % foreign key reference(s); resolve them before dropping.', ref_count;
  END IF;
END $$;

DROP FUNCTION IF EXISTS add_nature_type(TEXT, TEXT);
DROP TABLE IF EXISTS rights_nature_types;

COMMIT;
