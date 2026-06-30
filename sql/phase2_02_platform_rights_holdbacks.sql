-- ============================================================
-- phase2_02 — platform_rights: add holdbacks column
-- Adds a free-text holdbacks field to platform_rights.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
--
-- Depends on: 08_platform_rights.sql
-- ============================================================

ALTER TABLE platform_rights
    ADD COLUMN IF NOT EXISTS holdbacks TEXT;
