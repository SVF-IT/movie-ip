-- Row-Level Security Policies for Film IP Manager
-- Run this after the main schema is set up

-- Enable RLS on all tables
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

ALTER TABLE platform_rights ENABLE ROW LEVEL SECURITY;

ALTER TABLE rights_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE production_houses ENABLE ROW LEVEL SECURITY;

ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

ALTER TABLE rights_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE rights_agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE agreement_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role without causing recursion
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- MOVIES: All authenticated can read, editors/admins can write
-- ============================================================
DROP POLICY IF EXISTS "movies_select" ON movies;

CREATE POLICY "movies_select" ON movies FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "movies_insert" ON movies;

CREATE POLICY "movies_insert" ON movies FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'editor')
    );

DROP POLICY IF EXISTS "movies_update" ON movies;

CREATE POLICY "movies_update" ON movies FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'editor')
);

DROP POLICY IF EXISTS "movies_delete" ON movies;

CREATE POLICY "movies_delete" ON movies FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);
-- ============================================================
-- PLATFORM_RIGHTS: All read, admins/legal/editors can write
-- ============================================================
DROP POLICY IF EXISTS "platform_rights_select" ON platform_rights;

CREATE POLICY "platform_rights_select" ON platform_rights FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "platform_rights_insert" ON platform_rights;

CREATE POLICY "platform_rights_insert" ON platform_rights FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

DROP POLICY IF EXISTS "platform_rights_update" ON platform_rights;

CREATE POLICY "platform_rights_update" ON platform_rights FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
);

DROP POLICY IF EXISTS "platform_rights_delete" ON platform_rights;

CREATE POLICY "platform_rights_delete" ON platform_rights FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

-- ============================================================
-- RIGHTS_HISTORY: All read, admins/legal can write
-- ============================================================
DROP POLICY IF EXISTS "rights_history_select" ON rights_history;

CREATE POLICY "rights_history_select" ON rights_history FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rights_history_insert" ON rights_history;

CREATE POLICY "rights_history_insert" ON rights_history FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal', 'editor')
    );

-- ============================================================
-- USER_PROFILES: Users can read all, edit own, admins can manage all
-- ============================================================
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;

CREATE POLICY "user_profiles_select" ON user_profiles FOR
SELECT TO authenticated USING (true);

-- Users can update their own profile (but NOT role or is_active)
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;

DROP POLICY IF EXISTS "user_profiles_update_own_fields" ON user_profiles;

CREATE POLICY "user_profiles_update_own_fields" ON user_profiles FOR
UPDATE TO authenticated USING (id = auth.uid ())
WITH
    CHECK (
        id = auth.uid ()
        AND role = (
            SELECT role
            FROM public.user_profiles
            WHERE
                id = auth.uid ()
        )
        AND is_active = (
            SELECT is_active
            FROM public.user_profiles
            WHERE
                id = auth.uid ()
        )
    );

-- Admins can update any profile (including role and is_active)
DROP POLICY IF EXISTS "user_profiles_admin_update" ON user_profiles;

CREATE POLICY "user_profiles_admin_update" ON user_profiles FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- Only admins can delete profiles
DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;

CREATE POLICY "user_profiles_delete" ON user_profiles FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- Users can only insert their own profile row
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;

CREATE POLICY "user_profiles_insert" ON user_profiles FOR
INSERT
    TO authenticated
WITH
    CHECK (id = auth.uid ());

-- ============================================================
-- PRODUCTION_HOUSES: All read, admins/editors can create/edit, admins can delete
-- ============================================================
-- Drop overly broad policies from migration #3 (if they exist)
DROP POLICY IF EXISTS "Allow authenticated read on production_houses" ON production_houses;

DROP POLICY IF EXISTS "Allow authenticated insert on production_houses" ON production_houses;

DROP POLICY IF EXISTS "Allow authenticated update on production_houses" ON production_houses;

DROP POLICY IF EXISTS "Allow authenticated delete on production_houses" ON production_houses;

DROP POLICY IF EXISTS "production_houses_select" ON production_houses;

CREATE POLICY "production_houses_select" ON production_houses FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "production_houses_insert" ON production_houses;

CREATE POLICY "production_houses_insert" ON production_houses FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'editor')
    );

DROP POLICY IF EXISTS "production_houses_update" ON production_houses;

CREATE POLICY "production_houses_update" ON production_houses FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'editor')
);

DROP POLICY IF EXISTS "production_houses_delete" ON production_houses;

CREATE POLICY "production_houses_delete" ON production_houses FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- ============================================================
-- PLATFORMS: All read, admins/editors can create/edit, admins can delete
-- ============================================================
DROP POLICY IF EXISTS "platforms_select" ON platforms;

CREATE POLICY "platforms_select" ON platforms FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "platforms_insert" ON platforms;

CREATE POLICY "platforms_insert" ON platforms FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'editor')
    );

DROP POLICY IF EXISTS "platforms_update" ON platforms;

CREATE POLICY "platforms_update" ON platforms FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'editor')
);

DROP POLICY IF EXISTS "platforms_delete" ON platforms;

CREATE POLICY "platforms_delete" ON platforms FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- ============================================================
-- RIGHTS_TYPES: All read, admins write
-- ============================================================
DROP POLICY IF EXISTS "rights_types_select" ON rights_types;

CREATE POLICY "rights_types_select" ON rights_types FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rights_types_insert" ON rights_types;

CREATE POLICY "rights_types_insert" ON rights_types FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) = 'admin'
    );

DROP POLICY IF EXISTS "rights_types_update" ON rights_types;

CREATE POLICY "rights_types_update" ON rights_types FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

DROP POLICY IF EXISTS "rights_types_delete" ON rights_types;

CREATE POLICY "rights_types_delete" ON rights_types FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) = 'admin'
);

-- ============================================================
-- PEOPLE: All read, admins/editors can write
-- ============================================================
DROP POLICY IF EXISTS "people_select" ON people;

CREATE POLICY "people_select" ON people FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "people_insert" ON people;

CREATE POLICY "people_insert" ON people FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'editor')
    );

DROP POLICY IF EXISTS "people_update" ON people;

CREATE POLICY "people_update" ON people FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'editor')
);

DROP POLICY IF EXISTS "people_delete" ON people;

CREATE POLICY "people_delete" ON people FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'editor')
);

-- ============================================================
-- AUDIT_LOGS: Only admins can read, writes via SECURITY DEFINER triggers
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;

CREATE POLICY "audit_logs_select" ON audit_logs FOR
SELECT TO authenticated USING (
        public.get_user_role (auth.uid ()) = 'admin'
    );

-- ============================================================
-- RIGHTS_AGREEMENTS: All read, admins/legal can write
-- ============================================================
DROP POLICY IF EXISTS "rights_agreements_select" ON rights_agreements;

CREATE POLICY "rights_agreements_select" ON rights_agreements FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rights_agreements_insert" ON rights_agreements;

CREATE POLICY "rights_agreements_insert" ON rights_agreements FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal')
    );

DROP POLICY IF EXISTS "rights_agreements_update" ON rights_agreements;

CREATE POLICY "rights_agreements_update" ON rights_agreements FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

DROP POLICY IF EXISTS "rights_agreements_delete" ON rights_agreements;

CREATE POLICY "rights_agreements_delete" ON rights_agreements FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

-- ============================================================
-- AGREEMENT_DOCUMENTS: All read, admins/legal can write
-- ============================================================
DROP POLICY IF EXISTS "agreement_documents_select" ON agreement_documents;

CREATE POLICY "agreement_documents_select" ON agreement_documents FOR
SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agreement_documents_insert" ON agreement_documents;

CREATE POLICY "agreement_documents_insert" ON agreement_documents FOR
INSERT
    TO authenticated
WITH
    CHECK (
        public.get_user_role (auth.uid ()) IN ('admin', 'legal')
    );

DROP POLICY IF EXISTS "agreement_documents_update" ON agreement_documents;

CREATE POLICY "agreement_documents_update" ON agreement_documents FOR
UPDATE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

DROP POLICY IF EXISTS "agreement_documents_delete" ON agreement_documents;

CREATE POLICY "agreement_documents_delete" ON agreement_documents FOR DELETE TO authenticated USING (
    public.get_user_role (auth.uid ()) IN ('admin', 'legal')
);

-- ============================================================
-- NOTIFICATIONS: Users can only access their own notifications
-- ============================================================
DROP POLICY IF EXISTS "notifications_select" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR
SELECT TO authenticated USING (user_id = auth.uid ());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;

CREATE POLICY "notifications_insert" ON notifications FOR
INSERT
    TO authenticated
WITH
    CHECK (true);

DROP POLICY IF EXISTS "notifications_update" ON notifications;

CREATE POLICY "notifications_update" ON notifications FOR
UPDATE TO authenticated USING (user_id = auth.uid ());
