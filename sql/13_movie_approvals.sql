-- ============================================================
-- 13 — movie_approvals
-- Audit trail for approve / reject decisions on movies.
-- Depends on: 06_movies.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS movie_approvals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_id      UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    status        TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_name TEXT,
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movie_approvals_movie  ON movie_approvals (movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_approvals_status ON movie_approvals (status);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE movie_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals_select" ON movie_approvals
    FOR SELECT USING (true);

-- Any authenticated user can insert an approval row (the app
-- controls who triggers this action at the API layer)
CREATE POLICY "approvals_insert" ON movie_approvals
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
