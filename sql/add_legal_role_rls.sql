-- ============================================================
-- Add 'legal' role to RLS policies for tables it should have
-- write access to, matching the app-level permissions matrix.
--
-- Legal can:
--   people        → INSERT, UPDATE, DELETE
--   movies        → INSERT, UPDATE, DELETE (editor can delete pending/rejected)
--   movie_people  → ALL (insert/update/delete cast & crew links)
--   platforms     → INSERT, UPDATE (no delete)
--   production_houses → INSERT, UPDATE (no delete)
-- ============================================================

-- ── people ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "people_insert" ON people;

CREATE POLICY "people_insert" ON people FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

DROP POLICY IF EXISTS "people_update" ON people;

CREATE POLICY "people_update" ON people FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

DROP POLICY IF EXISTS "people_delete" ON people;

CREATE POLICY "people_delete" ON people FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

-- ── movies ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "movies_insert" ON movies;

CREATE POLICY "movies_insert" ON movies FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

DROP POLICY IF EXISTS "movies_update" ON movies;

CREATE POLICY "movies_update" ON movies FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

DROP POLICY IF EXISTS "movies_delete" ON movies;

CREATE POLICY "movies_delete" ON movies FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
    OR (
        public.get_user_role (auth.uid ()) = 'editor'
        AND approval_status IN ('pending', 'rejected')
    )
);

-- ── movie_people ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and editors can manage movie_people" ON movie_people;

CREATE POLICY "Admins,legal and editors can manage movie_people" ON movie_people FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE
            id = auth.uid ()
            AND role IN ('admin', 'legal', 'editor')
    )
);

-- ── platforms ────────────────────────────────────────────────
DROP POLICY IF EXISTS "platforms_insert" ON platforms;

CREATE POLICY "platforms_insert" ON platforms FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

DROP POLICY IF EXISTS "platforms_update" ON platforms;

CREATE POLICY "platforms_update" ON platforms FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

-- platforms_delete stays admin-only (no change needed)

-- ── production_houses ────────────────────────────────────────
DROP POLICY IF EXISTS "production_houses_insert" ON production_houses;

CREATE POLICY "production_houses_insert" ON production_houses FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

DROP POLICY IF EXISTS "production_houses_update" ON production_houses;

CREATE POLICY "production_houses_update" ON production_houses FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

-- production_houses_delete stays admin-only (no change needed)
