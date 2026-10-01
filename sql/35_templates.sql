-- ============================================================
-- 35 — templates
--
-- A generic, user-authored template: a saved name plus a saved rule-set.
-- Nothing about the rules lives in application code — the app reads
-- `definition` and executes exactly what the author saved. That is the point:
-- "Open Titles for SVOD" is not a code path, it is a row here.
--
-- `definition` is deliberately a free-form JSONB document rather than a set of
-- columns. The rule vocabulary will keep growing (export style, column
-- selection, scheduling were all named as coming), and each addition would
-- otherwise be a migration. The app validates the shape it understands and
-- ignores keys it does not, so an older deploy reading a newer template
-- degrades rather than breaks.
--
-- Templates are shared, not per-user: one person saves a definition and the
-- whole team clicks it. That is why there is no owner-scoped RLS here the way
-- saved_reports has — read is open to every authenticated user, and the roles
-- that handle rights may write.
--
-- Depends on: 00_extensions_and_helpers.sql (uuid-ossp,
--             update_updated_at_column, get_user_role)
-- Idempotent: safe to run more than once.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS templates (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name         VARCHAR(255) NOT NULL,
    description  TEXT,

    -- What the template produces. 'open_titles' is the only engine today;
    -- kept as free TEXT so a new kind needs no migration.
    kind         TEXT NOT NULL DEFAULT 'open_titles',

    -- The whole rule-set: criteria, filters, sort, and later export/column
    -- settings. Interpreted by the engine named in `kind`.
    definition   JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Reserved for templates that might ship with the system later. Every
    -- template is user-authored today, so this stays FALSE.
    is_builtin   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Ordering in the picker. Lower sorts first; ties fall back to name.
    sort_order   INTEGER NOT NULL DEFAULT 0,

    is_active    BOOLEAN NOT NULL DEFAULT TRUE,

    created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_kind ON templates(kind) WHERE is_active;

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
-- Read: every authenticated user, so anyone can click a template and get a
-- result. Running one is a plain SELECT and needs no privilege.
--
-- Write: admin tier, legal and the editor tier — the same roles that already
-- have full CRUD on rights themselves (see phase2_01_movie_rights_table.sql).
-- Templates are a working tool for those people, so gating them to admin would
-- just make the team queue behind one person. Viewer stays read-only.
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_select" ON templates;
CREATE POLICY "templates_select" ON templates
    FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "templates_insert" ON templates;
CREATE POLICY "templates_insert" ON templates
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role(auth.uid())
            IN ('admin', 'super_admin', 'legal', 'editor', 'data_analyst')
    );

DROP POLICY IF EXISTS "templates_update" ON templates;
CREATE POLICY "templates_update" ON templates
    FOR UPDATE TO authenticated
    USING (
        public.get_user_role(auth.uid())
            IN ('admin', 'super_admin', 'legal', 'editor', 'data_analyst')
    );

DROP POLICY IF EXISTS "templates_delete" ON templates;
CREATE POLICY "templates_delete" ON templates
    FOR DELETE TO authenticated
    USING (
        public.get_user_role(auth.uid())
            IN ('admin', 'super_admin', 'legal', 'editor', 'data_analyst')
    );

COMMIT;
