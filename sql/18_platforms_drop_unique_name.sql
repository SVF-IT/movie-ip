-- ============================================================
-- 18 — Drop unique constraint on platforms.name
-- Allows the same platform name with different types
-- (e.g. "Star" as Satellite TV and "Star" as DTH VOD).
-- Run once on the live DB.
-- ============================================================

-- Drop the unique constraint (constraint name matches the default Postgres naming)
ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_name_key;

-- Now unique is (name, platform_type) together — same name allowed if type differs
ALTER TABLE platforms
    ADD CONSTRAINT platforms_name_type_unique UNIQUE (name, platform_type);
