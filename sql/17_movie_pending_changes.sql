-- ============================================================
-- 17 — movie_pending_changes
-- Staging table for editor-submitted changes that require
-- admin/legal approval before being applied to movies.
-- Depends on: 06_movies.sql, 12_user_profiles.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS movie_pending_changes (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    movie_id       UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    changed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_by_name TEXT,
    change_type    TEXT NOT NULL CHECK (
                       change_type IN (
                           'movie_fields',
                           'right_create',
                           'right_update',
                           'right_delete',
                           'person_add',
                           'person_remove'
                       )
                   ),
    change_summary TEXT NOT NULL,
    payload        JSONB NOT NULL DEFAULT '{}',
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_name  TEXT,
    reason         TEXT,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movie_pending_changes_movie_id  ON movie_pending_changes (movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_pending_changes_status    ON movie_pending_changes (status);
CREATE INDEX IF NOT EXISTS idx_movie_pending_changes_created   ON movie_pending_changes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movie_pending_changes_changed_by ON movie_pending_changes (changed_by);

-- ── updated_at trigger ───────────────────────────────────────
CREATE TRIGGER trg_movie_pending_changes_updated_at
    BEFORE UPDATE ON movie_pending_changes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movie_pending_changes ENABLE ROW LEVEL SECURITY;

-- Editors can see their own submissions; admins/legal see all
CREATE POLICY "pending_changes_select" ON movie_pending_changes
    FOR SELECT TO authenticated USING (
        changed_by = auth.uid()
        OR public.current_user_role() IN ('admin', 'legal')
    );

-- Editors/admins/legal can submit changes
CREATE POLICY "pending_changes_insert" ON movie_pending_changes
    FOR INSERT TO authenticated WITH CHECK (
        public.current_user_role() IN ('admin', 'legal', 'editor')
    );

-- Only admins/legal can approve or reject (update status)
CREATE POLICY "pending_changes_update" ON movie_pending_changes
    FOR UPDATE TO authenticated USING (
        public.current_user_role() IN ('admin', 'legal')
    );

-- Only admins can hard-delete
CREATE POLICY "pending_changes_delete" ON movie_pending_changes
    FOR DELETE TO authenticated USING (
        public.current_user_role() = 'admin'
    );
