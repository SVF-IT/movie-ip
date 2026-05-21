# Film IP Manager — SQL Migrations

All pending database migrations for the DBA to apply. Run them in the order listed below.

> **Base schema assumed:** `supabase-schema.sql` must be deployed first. It creates core tables (`movies`, `platforms`, `people`, `languages`, `production_houses`, `rights_types`, `platform_rights`, `rights_history`, `user_profiles`, `audit_logs`, `movie_cast`, `movie_directors`), basic RLS policies, the `update_updated_at_column()` function, basic views, and seed data.

---

## Migration Execution Order

| # | Migration | Type | Dependencies |
|---|-----------|------|--------------|
| 0 | [Add Missing Code Columns](#0-add-missing-code-columns) | ALTER TABLE | **Run first** — adds `code` columns to existing tables |
| 1 | [Helper Function — get_user_role()](#1-helper-function--get_user_role) | CREATE FUNCTION | Before any role-based RLS policies |
| 2 | [Rights Agreements — Base Setup](#2-rights-agreements--base-setup) | CREATE TABLE + ALTER | After #0 |
| 3 | [Rights Agreements — Expanded Fields](#3-rights-agreements--expanded-fields) | ALTER TABLE | After #2 |
| 4 | [User Profiles — New Columns](#4-user-profiles--new-columns) | ALTER TABLE | Backfill `employee_id` on existing rows |
| 5 | [Production Houses — Add Code Column & RLS](#5-production-houses--add-code-column--rls) | ALTER TABLE + POLICY | After #1 |
| 6 | [Missing Tables — agreement_documents, saved_reports, notifications, user_activity](#6-missing-tables) | CREATE TABLE | After #2 (rights_agreements must exist) |
| 7 | [Views — Create or Replace](#7-views--create-or-replace) | CREATE VIEW | After #0 and #2 |
| 8 | [Audit Logs — Function, RLS & Triggers](#8-audit-logs--function-rls--triggers) | CREATE FUNCTION + TRIGGER | After #5 and #6 (all tables must exist) |
| 9 | [RLS Policy Fixes — Missing & Corrected Policies](#9-rls-policy-fixes--missing--corrected-policies) | CREATE POLICY | After #1 and all previous migrations |
| 10 | [RPC Functions — Renew & Transfer Rights](#10-rpc-functions--renew--transfer-rights) | CREATE FUNCTION | After #2 (platform_rights + agreement_id column) |
| 11 | [Storage Bucket Policies](#11-storage-bucket-policies) | CREATE POLICY | Anytime — applies to `storage.objects` |
| 12 | [Agreement Documents — Label Column](#12-agreement-documents--label-column) | ALTER TABLE | After #6 |
| 13 | [Rights Agreements — AI Fields](#13-rights-agreements--ai-fields) | ALTER TABLE | After #3 |
| 14 | [Email Notifications — Settings & Preferences](#14-email-notifications--settings--preferences) | CREATE TABLE | After #1 (requires `get_user_role()`) |
| 15 | [Perpetual Dates Backfill](#15-perpetual-dates-backfill) | UPDATE | Backfills '3099-12-31' for perpetual rights |

---

# 0. Add Missing Code Columns

The frontend expects a `code` column on several tables for display/reference purposes. These columns are missing from the base schema.

```sql
-- Add code column to movies
ALTER TABLE movies ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Add code column to people
ALTER TABLE people ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Add code column to platforms
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Add code column to rights_types
ALTER TABLE rights_types ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- Add code column to platform_rights
ALTER TABLE platform_rights ADD COLUMN IF NOT EXISTS code VARCHAR(50);
```

### Verification

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'code'
AND table_name IN ('movies', 'people', 'platforms', 'rights_types', 'platform_rights')
ORDER BY table_name;
```

Expected: 5 rows, one for each table.

---

# 1. Helper Function — get_user_role()

> **IMPORTANT:** This function is used by all role-based RLS policies in later migrations. It must be created before migrations #5, #8, and #9.

This helper avoids infinite recursion when RLS policies on `user_profiles` need to check the user's role.

```sql
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### Verification

```sql
-- Should return the role of the current user
SELECT public.get_user_role(auth.uid());
```

---

# 2. Rights Agreements — Base Setup

Creates the `rights_agreements` table and adds the missing `agreement_id` foreign key to `platform_rights`.

```sql
-- 1. Create rights_agreements table
CREATE TABLE IF NOT EXISTS rights_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50),
    platform_id UUID REFERENCES platforms(id),
    title VARCHAR(255),
    summary TEXT,
    start_date DATE,
    end_date DATE,
    signed_date DATE,
    agreement_value NUMERIC,
    currency VARCHAR(10) DEFAULT 'INR',
    territory VARCHAR(255) DEFAULT 'World',
    exclusivity VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add agreement_id to platform_rights (THE CRITICAL RELATIONSHIP)
ALTER TABLE platform_rights
ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES rights_agreements(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_rights_agreements_platform ON rights_agreements(platform_id);
CREATE INDEX IF NOT EXISTS idx_rights_agreements_status ON rights_agreements(status);
CREATE INDEX IF NOT EXISTS idx_rights_agreements_dates ON rights_agreements(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_platform_rights_agreement ON platform_rights(agreement_id);

-- 4. Enable RLS
ALTER TABLE rights_agreements ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (admin + legal can write; all can read)
CREATE POLICY "rights_agreements_select" ON rights_agreements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "rights_agreements_insert" ON rights_agreements
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'legal'));

CREATE POLICY "rights_agreements_update" ON rights_agreements
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'legal'));

CREATE POLICY "rights_agreements_delete" ON rights_agreements
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'legal'));

-- 6. Trigger for updated_at
CREATE TRIGGER update_rights_agreements_updated_at
    BEFORE UPDATE ON rights_agreements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Verification

```sql
-- Confirm table and FK
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'rights_agreements' ORDER BY ordinal_position;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'platform_rights' AND column_name = 'agreement_id';
```

---

# 3. Rights Agreements — Expanded Fields

Add 25 new columns to `rights_agreements` for BI & financial analytics.

All columns are nullable with no defaults — existing data is unaffected.

```sql
ALTER TABLE rights_agreements
  ADD COLUMN IF NOT EXISTS deal_type text,
  ADD COLUMN IF NOT EXISTS minimum_guarantee numeric,
  ADD COLUMN IF NOT EXISTS revenue_share_percent numeric,
  ADD COLUMN IF NOT EXISTS advance_payment numeric,
  ADD COLUMN IF NOT EXISTS royalty_rate numeric,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS marketing_commitment numeric,
  ADD COLUMN IF NOT EXISTS delivery_cost numeric,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS withholding_tax_rate numeric,
  ADD COLUMN IF NOT EXISTS territory_type text,
  ADD COLUMN IF NOT EXISTS excluded_territories text,
  ADD COLUMN IF NOT EXISTS sub_licensing_allowed boolean,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS language_scope text,
  ADD COLUMN IF NOT EXISTS platforms_scope text,
  ADD COLUMN IF NOT EXISTS renewal_type text,
  ADD COLUMN IF NOT EXISTS renewal_terms text,
  ADD COLUMN IF NOT EXISTS counterparty_type text,
  ADD COLUMN IF NOT EXISTS governing_law text,
  ADD COLUMN IF NOT EXISTS dispute_resolution text,
  ADD COLUMN IF NOT EXISTS notice_period_days integer,
  ADD COLUMN IF NOT EXISTS business_unit text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS internal_notes text;
```

---

# 4. User Profiles — New Columns

Adds `employee_id` (mandatory, unique) and `must_change_password` (boolean) to `user_profiles`.

> **Important:** `employee_id` is NOT NULL. Existing rows must be backfilled before applying the constraint.

### Step 1: Add columns

```sql
-- Add employee_id (nullable first to allow backfill)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

-- Add must_change_password flag
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Backfill existing users with must_change_password = false
UPDATE user_profiles SET must_change_password = FALSE WHERE must_change_password IS NULL;
```

### Step 2: Backfill employee_id on existing users

```sql
-- Option A: Set actual employee IDs
-- UPDATE user_profiles SET employee_id = 'EMP-001' WHERE email = 'admin@example.com';
-- UPDATE user_profiles SET employee_id = 'EMP-002' WHERE email = 'user2@example.com';

-- Option B: Auto-generate temporary IDs (replace with real IDs later)
UPDATE user_profiles
SET employee_id = 'TEMP-' || ROW_NUMBER() OVER (ORDER BY created_at)
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM user_profiles) sub
WHERE user_profiles.id = sub.id AND user_profiles.employee_id IS NULL;
```

### Step 3: Apply constraints

```sql
-- After backfill is complete, add NOT NULL and UNIQUE
ALTER TABLE user_profiles ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_employee_id_unique UNIQUE (employee_id);
```

### Verification

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name IN ('employee_id', 'must_change_password');
```

Expected: `employee_id` (varchar, NO), `must_change_password` (boolean, YES).

---

# 5. Production Houses — Add Code Column & RLS

The `production_houses` table exists in the base schema but is missing the `code` column and proper role-based RLS policies.

```sql
-- 1. Add code column
ALTER TABLE production_houses ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE;

-- 2. Enable RLS (idempotent)
ALTER TABLE production_houses ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing overly broad policies
DROP POLICY IF EXISTS "Allow authenticated read on production_houses" ON production_houses;
DROP POLICY IF EXISTS "Allow authenticated insert on production_houses" ON production_houses;
DROP POLICY IF EXISTS "Allow authenticated update on production_houses" ON production_houses;
DROP POLICY IF EXISTS "Allow authenticated delete on production_houses" ON production_houses;

-- 4. Create role-restricted policies
DROP POLICY IF EXISTS "production_houses_select" ON production_houses;
CREATE POLICY "production_houses_select" ON production_houses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "production_houses_insert" ON production_houses;
CREATE POLICY "production_houses_insert" ON production_houses
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "production_houses_update" ON production_houses;
CREATE POLICY "production_houses_update" ON production_houses
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "production_houses_delete" ON production_houses;
CREATE POLICY "production_houses_delete" ON production_houses
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 5. Add FK on movies (if not present)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS production_house_id UUID;
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_production_house_id_fkey;
ALTER TABLE movies ADD CONSTRAINT movies_production_house_id_fkey
  FOREIGN KEY (production_house_id) REFERENCES production_houses(id) ON DELETE SET NULL;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_movies_production_house_id ON movies(production_house_id);
CREATE INDEX IF NOT EXISTS idx_production_houses_name ON production_houses(name);
```

### Verification

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'production_houses' ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'production_houses';
```

---

# 6. Missing Tables

**Prerequisite:** `rights_agreements` table must exist (migration #2).

These tables are used by the frontend but don't exist in the base schema.

### 6a. agreement_documents

```sql
CREATE TABLE IF NOT EXISTS agreement_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES rights_agreements(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    uploaded_by UUID REFERENCES auth.users(id),
    uploaded_by_name VARCHAR(255),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by UUID REFERENCES auth.users(id),
    deleted_by_name VARCHAR(255),
    deleted_at TIMESTAMPTZ,
    replaced_by UUID REFERENCES agreement_documents(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agreement_documents_agreement ON agreement_documents(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_documents_active ON agreement_documents(agreement_id) WHERE is_deleted = FALSE;

ALTER TABLE agreement_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agreement_documents_select" ON agreement_documents
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "agreement_documents_insert" ON agreement_documents
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'legal'));
CREATE POLICY "agreement_documents_update" ON agreement_documents
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'legal'));
CREATE POLICY "agreement_documents_delete" ON agreement_documents
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) IN ('admin', 'legal'));

CREATE TRIGGER update_agreement_documents_updated_at
    BEFORE UPDATE ON agreement_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 6b. saved_reports

> **Note:** The frontend uses `template_id` (not `report_type`) and `filters` as JSONB. The `columns` / `sort_config` fields from earlier drafts are not used.

```sql
CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    template_id VARCHAR(100),
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON saved_reports(user_id);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_reports_select" ON saved_reports
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saved_reports_insert" ON saved_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_reports_update" ON saved_reports
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saved_reports_delete" ON saved_reports
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_reports_updated_at
    BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 6c. notifications

> **Note:** The frontend uses `severity`, `resource_type`, and `resource_id` — not `related_table` / `related_id`.

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50),
    severity VARCHAR(20) DEFAULT 'info',
    resource_type VARCHAR(100),
    resource_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_update" ON notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT TO authenticated WITH CHECK (true);
```

### 6d. user_activity

The frontend's `logActivity()` function writes to this table for tracking user actions.

```sql
CREATE TABLE IF NOT EXISTS user_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created ON user_activity(created_at);

ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Users can insert their own activity (auto-populated via auth.uid())
CREATE POLICY "user_activity_insert" ON user_activity
    FOR INSERT TO authenticated WITH CHECK (true);

-- Users can view their own activity; admins can view all
CREATE POLICY "user_activity_select" ON user_activity
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');
```

### Verification

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('agreement_documents', 'saved_reports', 'notifications', 'user_activity');
```

Expected: 4 rows.

---

# 7. Views — Create or Replace

These views are used by the frontend dashboard, expiring rights page, and analytics. They should be created **after** migrations #0 and #2 (because `expiring_rights` depends on `platform_rights` columns added in those migrations).

> **Note:** These views already exist in the base schema but the versions below are improved (e.g., `expiring_rights` shows all future expiries, not just 90 days).
>
> **IMPORTANT:** All views use `security_invoker = on` so they respect the querying user's RLS policies. Without this, views default to `SECURITY DEFINER` and bypass RLS — a critical security issue flagged by Supabase.
>
> **TODO:** Run the entire SQL block below in **Supabase SQL Editor** to recreate the views with `security_invoker = on`. This will resolve the 4 critical "Security Definer View" warnings on: `movies_with_details`, `expiring_rights`, `dashboard_stats`, `available_for_rights`.

```sql
-- View: movies_with_details
CREATE OR REPLACE VIEW movies_with_details
WITH (security_invoker = on) AS
SELECT
    m.id, m.title, m.production_no, m.source,
    m.release_date, m.release_year, m.certification,
    m.language_id, m.production_house_id,
    m.color_or_bw, m.trailer_link, m.poster_url,
    m.assignor_licensor, m.licensee,
    m.agreement_date, m.agreement_start_date, m.agreement_end_date,
    m.primary_rights_acquired, m.internet_rights_classification,
    m.secondary_rights, m.prequel_sequel_rights, m.character_rights,
    m.subtitling_rights, m.dubbing_rights, m.nature_of_rights, m.territory,
    m.fvod_holdback, m.avod_holdback,
    m.remarks, m.actionables, m.created_at, m.updated_at,
    l.name as language_name,
    ph.name as production_house_name,
    (
        SELECT string_agg(p.name, ', ' ORDER BY mc.billing_order)
        FROM movie_cast mc
        JOIN people p ON mc.person_id = p.id
        WHERE mc.movie_id = m.id
        LIMIT 5
    ) as cast_names,
    (
        SELECT string_agg(p.name, ', ')
        FROM movie_directors md
        JOIN people p ON md.person_id = p.id
        WHERE md.movie_id = m.id
    ) as director_names
FROM movies m
LEFT JOIN languages l ON m.language_id = l.id
LEFT JOIN production_houses ph ON m.production_house_id = ph.id;

-- View: expiring_rights (shows ALL future expiries with days_until_expiry)
CREATE OR REPLACE VIEW expiring_rights
WITH (security_invoker = on) AS
SELECT
    pr.id, pr.movie_id,
    m.title as movie_title, m.source as movie_source,
    pr.platform_id, p.name as platform_name,
    pr.rights_type_id, rt.name as rights_type_name,
    pr.license_type, pr.category, pr.nature,
    pr.start_date, pr.end_date, pr.territory,
    pr.is_current, pr.remarks,
    (pr.end_date::date - CURRENT_DATE) as days_until_expiry
FROM platform_rights pr
JOIN movies m ON pr.movie_id = m.id
LEFT JOIN platforms p ON pr.platform_id = p.id
LEFT JOIN rights_types rt ON pr.rights_type_id = rt.id
WHERE pr.is_current = true
  AND pr.end_date IS NOT NULL
  AND pr.end_date >= CURRENT_DATE
ORDER BY pr.end_date;

-- View: dashboard_stats
CREATE OR REPLACE VIEW dashboard_stats
WITH (security_invoker = on) AS
SELECT
    (SELECT COUNT(*) FROM movies) as total_movies,
    (SELECT COUNT(*) FROM movies WHERE source = 'home_production') as home_productions,
    (SELECT COUNT(*) FROM movies WHERE source = 'acquired') as acquired_movies,
    (SELECT COUNT(DISTINCT person_id) FROM movie_cast) as total_actors,
    (SELECT COUNT(DISTINCT person_id) FROM movie_directors) as total_directors,
    (SELECT COUNT(*) FROM platform_rights WHERE is_current = true) as active_rights,
    (
        SELECT COUNT(*) FROM platform_rights
        WHERE is_current = true AND end_date IS NOT NULL
          AND end_date >= CURRENT_DATE
          AND end_date <= CURRENT_DATE + INTERVAL '30 days'
    ) as rights_expiring_30_days,
    (
        SELECT COUNT(*) FROM platform_rights
        WHERE is_current = true AND end_date IS NOT NULL
          AND end_date >= CURRENT_DATE
          AND end_date <= CURRENT_DATE + INTERVAL '90 days'
    ) as rights_expiring_90_days;

-- View: available_for_rights
CREATE OR REPLACE VIEW available_for_rights
WITH (security_invoker = on) AS
SELECT m.*,
    l.name as language_name,
    ph.name as production_house_name
FROM movies m
LEFT JOIN languages l ON m.language_id = l.id
LEFT JOIN production_houses ph ON m.production_house_id = ph.id
WHERE NOT EXISTS (
    SELECT 1 FROM platform_rights pr
    WHERE pr.movie_id = m.id AND pr.is_current = true
);
```

### Verification

```sql
SELECT table_name, table_type FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('movies_with_details', 'expiring_rights', 'dashboard_stats', 'available_for_rights');
```

Expected: 4 rows with `table_type = 'VIEW'`.

Verify security invoker is enabled (no SECURITY DEFINER warnings):
```sql
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN ('movies_with_details', 'expiring_rights', 'dashboard_stats', 'available_for_rights');
```

---

# 8. Audit Logs — Function, RLS & Triggers

**Prerequisite:** All tables must exist before creating triggers on them (migrations #5 and #6).

The `audit_logs` table already exists in the base schema. This migration adds the trigger function, RLS policy, and triggers on all major tables.

> **DBA NOTE:** An earlier version of this function had a bug (`COALESCE(NEW.id::text, OLD.id::text)`) that caused a UUID/text type mismatch. The version below is corrected. If you previously deployed the buggy version, re-running the `CREATE OR REPLACE` below will fix it.

### Step 1: Enable RLS and add policy

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');
```

### Step 2: Create the trigger function

```sql
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE
      WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
      WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
      ELSE NULL
    END,
    CASE
      WHEN TG_OP = 'DELETE' THEN NULL
      ELSE row_to_json(NEW)::jsonb
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 3: Create all triggers

#### Tables covered

| Table | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|
| movies | Y | Y | Y |
| platform_rights | Y | Y | Y |
| rights_history | Y | — | — |
| user_profiles | Y | Y | — |
| rights_agreements | Y | Y | Y |
| agreement_documents | Y | Y | — |
| people | Y | Y | Y |
| platforms | Y | Y | Y |
| production_houses | Y | Y | Y |
| saved_reports | Y | — | Y |

```sql
-- Movies: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_movies_insert ON movies;
CREATE TRIGGER audit_movies_insert AFTER INSERT ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_movies_update ON movies;
CREATE TRIGGER audit_movies_update AFTER UPDATE ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_movies_delete ON movies;
CREATE TRIGGER audit_movies_delete AFTER DELETE ON movies FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Platform Rights: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_platform_rights_insert ON platform_rights;
CREATE TRIGGER audit_platform_rights_insert AFTER INSERT ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_platform_rights_update ON platform_rights;
CREATE TRIGGER audit_platform_rights_update AFTER UPDATE ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_platform_rights_delete ON platform_rights;
CREATE TRIGGER audit_platform_rights_delete AFTER DELETE ON platform_rights FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Rights History: INSERT only
DROP TRIGGER IF EXISTS audit_rights_history_insert ON rights_history;
CREATE TRIGGER audit_rights_history_insert AFTER INSERT ON rights_history FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- User Profiles: INSERT, UPDATE
DROP TRIGGER IF EXISTS audit_user_profiles_insert ON user_profiles;
CREATE TRIGGER audit_user_profiles_insert AFTER INSERT ON user_profiles FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_user_profiles_update ON user_profiles;
CREATE TRIGGER audit_user_profiles_update AFTER UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Rights Agreements: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_rights_agreements_insert ON rights_agreements;
CREATE TRIGGER audit_rights_agreements_insert AFTER INSERT ON rights_agreements FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_rights_agreements_update ON rights_agreements;
CREATE TRIGGER audit_rights_agreements_update AFTER UPDATE ON rights_agreements FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_rights_agreements_delete ON rights_agreements;
CREATE TRIGGER audit_rights_agreements_delete AFTER DELETE ON rights_agreements FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Agreement Documents: INSERT, UPDATE
DROP TRIGGER IF EXISTS audit_agreement_documents_insert ON agreement_documents;
CREATE TRIGGER audit_agreement_documents_insert AFTER INSERT ON agreement_documents FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_agreement_documents_update ON agreement_documents;
CREATE TRIGGER audit_agreement_documents_update AFTER UPDATE ON agreement_documents FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- People: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_people_insert ON people;
CREATE TRIGGER audit_people_insert AFTER INSERT ON people FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_people_update ON people;
CREATE TRIGGER audit_people_update AFTER UPDATE ON people FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_people_delete ON people;
CREATE TRIGGER audit_people_delete AFTER DELETE ON people FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Platforms: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_platforms_insert ON platforms;
CREATE TRIGGER audit_platforms_insert AFTER INSERT ON platforms FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_platforms_update ON platforms;
CREATE TRIGGER audit_platforms_update AFTER UPDATE ON platforms FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_platforms_delete ON platforms;
CREATE TRIGGER audit_platforms_delete AFTER DELETE ON platforms FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Production Houses: INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS audit_production_houses_insert ON production_houses;
CREATE TRIGGER audit_production_houses_insert AFTER INSERT ON production_houses FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_production_houses_update ON production_houses;
CREATE TRIGGER audit_production_houses_update AFTER UPDATE ON production_houses FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_production_houses_delete ON production_houses;
CREATE TRIGGER audit_production_houses_delete AFTER DELETE ON production_houses FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Saved Reports: INSERT, DELETE
DROP TRIGGER IF EXISTS audit_saved_reports_insert ON saved_reports;
CREATE TRIGGER audit_saved_reports_insert AFTER INSERT ON saved_reports FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS audit_saved_reports_delete ON saved_reports;
CREATE TRIGGER audit_saved_reports_delete AFTER DELETE ON saved_reports FOR EACH ROW EXECUTE FUNCTION log_audit_event();
```

### Verification

```sql
-- Confirm trigger function exists
SELECT routine_name, routine_type FROM information_schema.routines
WHERE routine_name = 'log_audit_event';

-- Confirm all triggers (expect 25 total)
SELECT trigger_name, event_object_table, event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
ORDER BY event_object_table, event_manipulation;

-- Test: insert any record and confirm audit_logs gets an entry
SELECT id, action, table_name, record_id, created_at
FROM audit_logs ORDER BY created_at DESC LIMIT 5;
```

---

# 9. RLS Policy Fixes — Missing & Corrected Policies

**Prerequisite:** Run after all previous migrations (#0–#8).

This migration adds missing UPDATE/DELETE policies and fixes inconsistencies identified during a platform-wide RBAC audit.

### Summary of Changes

| Table | Change |
|-------|--------|
| platforms | **Added** INSERT (admin, editor), UPDATE (admin, editor), DELETE (admin) |
| people | **Added** UPDATE (admin, editor), DELETE (admin, editor) |
| languages | **Added** UPDATE (admin), DELETE (admin) |
| rights_types | **Added** UPDATE (admin), DELETE (admin) |
| platform_rights | **Fixed** DELETE from admin-only to (admin, legal) |

> **Note:** `rights_agreements`, `agreement_documents`, `production_houses`, `saved_reports`, and `notifications` already have correct policies from earlier migrations in this document.

```sql
-- ============================================================
-- Platforms: Add INSERT, UPDATE, DELETE policies
-- ============================================================
DROP POLICY IF EXISTS "platforms_insert" ON platforms;
CREATE POLICY "platforms_insert" ON platforms
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "platforms_update" ON platforms;
CREATE POLICY "platforms_update" ON platforms
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "platforms_delete" ON platforms;
CREATE POLICY "platforms_delete" ON platforms
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- People: Add UPDATE, DELETE policies
-- ============================================================
DROP POLICY IF EXISTS "people_update" ON people;
CREATE POLICY "people_update" ON people
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

DROP POLICY IF EXISTS "people_delete" ON people;
CREATE POLICY "people_delete" ON people
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'editor'));

-- ============================================================
-- Languages: Add UPDATE, DELETE policies
-- ============================================================
DROP POLICY IF EXISTS "languages_update" ON languages;
CREATE POLICY "languages_update" ON languages
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "languages_delete" ON languages;
CREATE POLICY "languages_delete" ON languages
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- Rights Types: Add UPDATE, DELETE policies
-- ============================================================
DROP POLICY IF EXISTS "rights_types_update" ON rights_types;
CREATE POLICY "rights_types_update" ON rights_types
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "rights_types_delete" ON rights_types;
CREATE POLICY "rights_types_delete" ON rights_types
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- Platform Rights: Fix DELETE to include legal
-- ============================================================
DROP POLICY IF EXISTS "platform_rights_delete" ON platform_rights;
CREATE POLICY "platform_rights_delete" ON platform_rights
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'legal'));

-- ============================================================
-- Enable RLS on tables that may not have it yet
-- ============================================================
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE rights_types ENABLE ROW LEVEL SECURITY;
```

### Verification

```sql
-- Confirm all policies exist
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('platforms', 'people', 'languages', 'rights_types', 'platform_rights')
ORDER BY tablename, cmd;

-- Confirm RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

# 10. RPC Functions — Renew & Transfer Rights

**Prerequisite:** `platform_rights` table must exist with `agreement_id` column (migrations #0 and #2).

These RPC functions provide atomic, server-side operations for renewing and transferring rights. They use row-level locking (`FOR UPDATE`) to prevent concurrent modifications and run as `SECURITY DEFINER` to bypass RLS during the multi-step transaction.

### Functions

| Function | Purpose | Key Parameters |
|----------|---------|---------------|
| `renew_right` | Updates end date, creates history entry | `p_right_id`, `p_new_end_date`, `p_remarks` |
| `transfer_right` | Marks old right inactive, creates new right on target platform | `p_right_id`, `p_new_platform_id`, `p_new_start_date`, `p_new_end_date`, `p_remarks`, `p_agreement_id` |

### Step 1: Create `renew_right` function

```sql
CREATE OR REPLACE FUNCTION public.renew_right(
  p_right_id UUID,
  p_new_end_date DATE,
  p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_right platform_rights%ROWTYPE;
  v_updated platform_rights%ROWTYPE;
BEGIN
  SELECT * INTO v_right FROM platform_rights WHERE id = p_right_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Right not found' USING ERRCODE = 'PGRST116';
  END IF;

  INSERT INTO rights_history (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    change_type, new_right_id, remarks
  ) VALUES (
    v_right.movie_id, v_right.platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    v_right.start_date, v_right.end_date, v_right.territory,
    'renewed', p_right_id, p_remarks
  );

  UPDATE platform_rights
  SET end_date = p_new_end_date,
      remarks = COALESCE(p_remarks, remarks),
      updated_at = NOW()
  WHERE id = p_right_id
  RETURNING * INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;
```

### Step 2: Create `transfer_right` function

```sql
CREATE OR REPLACE FUNCTION public.transfer_right(
  p_right_id UUID,
  p_new_platform_id UUID,
  p_new_start_date DATE,
  p_new_end_date DATE,
  p_remarks TEXT DEFAULT NULL,
  p_agreement_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_right platform_rights%ROWTYPE;
  v_new_right platform_rights%ROWTYPE;
BEGIN
  SELECT * INTO v_right FROM platform_rights WHERE id = p_right_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Right not found' USING ERRCODE = 'PGRST116';
  END IF;

  UPDATE platform_rights SET is_current = false WHERE id = p_right_id;

  INSERT INTO rights_history (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    change_type, remarks
  ) VALUES (
    v_right.movie_id, v_right.platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    v_right.start_date, v_right.end_date, v_right.territory,
    'transferred', p_remarks
  );

  INSERT INTO platform_rights (
    movie_id, platform_id, rights_type_id, license_type,
    category, nature, start_date, end_date, territory,
    is_current, remarks, agreement_id
  ) VALUES (
    v_right.movie_id, p_new_platform_id, v_right.rights_type_id,
    v_right.license_type, v_right.category, v_right.nature,
    p_new_start_date, p_new_end_date, v_right.territory,
    true, p_remarks, COALESCE(p_agreement_id, v_right.agreement_id)
  )
  RETURNING * INTO v_new_right;

  RETURN to_jsonb(v_new_right);
END;
$$;
```

### Verification

```sql
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_name IN ('renew_right', 'transfer_right')
ORDER BY routine_name;
```

Expected: 2 rows showing `FUNCTION` type with `DEFINER` security.

---

# 11. Storage Bucket Policies

> **TODO:** Run the SQL below in **Supabase SQL Editor** to allow authenticated users to upload/read/delete files from the `images` and `agreements` storage buckets. Without these policies, file uploads will fail with "new row violates row-level security policy".

The frontend uses these Supabase storage buckets:

| Bucket | Purpose | Max Size | Accepted Types |
|--------|---------|----------|----------------|
| `images` | Movie posters, profile images | 500KB | image/* |
| `agreements` | Agreement documents | 25MB | PDF, Word, Excel |
| `others` | General documents (future use) | 1MB | PDF, Word, Excel |

```sql
-- ════════════════════════════════════════════════
-- images bucket policies
-- ════════════════════════════════════════════════

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images');

CREATE POLICY "Authenticated users can update images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'images');

CREATE POLICY "Public read access for images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'images');

CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'images');

-- ════════════════════════════════════════════════
-- agreements bucket policies
-- ════════════════════════════════════════════════

CREATE POLICY "Authenticated users can upload agreements"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'agreements');

CREATE POLICY "Authenticated users can update agreements"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'agreements');

CREATE POLICY "Authenticated users can read agreements"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'agreements');

CREATE POLICY "Authenticated users can delete agreements"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'agreements');

-- ════════════════════════════════════════════════
-- others bucket policies (provisioned for future use)
-- ════════════════════════════════════════════════

CREATE POLICY "Authenticated users can upload to others"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'others');

CREATE POLICY "Authenticated users can update others"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'others');

CREATE POLICY "Authenticated users can read others"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'others');

CREATE POLICY "Authenticated users can delete from others"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'others');
```

### Verification

```sql
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;
```

Expected: 12 policies (4 per bucket x 3 buckets) for INSERT/UPDATE/SELECT/DELETE.

---

# 12. Agreement Documents — Label Column

> **TODO:** Run the SQL below in **Supabase SQL Editor** to add the `label` column to `agreement_documents`. This allows users to classify documents (e.g. Main, Original, 1st Amendment, Final, Active).

```sql
-- Add label column for document classification
ALTER TABLE agreement_documents
ADD COLUMN IF NOT EXISTS label VARCHAR(100);

COMMENT ON COLUMN agreement_documents.label IS 'User-defined classification label, e.g. Main, Original, 1st Amendment, 2nd Amendment, Final, Active';
```

### Verification

```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'agreement_documents' AND column_name = 'label';
```

---

# 13. Rights Agreements — AI Fields

> **TODO:** Run the SQL below in **Supabase SQL Editor** to add `key_terms` and `ai_summary` columns to `rights_agreements`. These store AI-extracted structured highlights and executive briefing from uploaded agreement documents.

```sql
-- Add AI-extracted key terms (categorized: RIGHTS:, FINANCIAL:, OBLIGATION:, etc.)
ALTER TABLE rights_agreements
ADD COLUMN IF NOT EXISTS key_terms JSONB;

-- Add AI-generated executive briefing
ALTER TABLE rights_agreements
ADD COLUMN IF NOT EXISTS ai_summary TEXT;

COMMENT ON COLUMN rights_agreements.key_terms IS 'AI-extracted key terms array, each prefixed with category (RIGHTS:, FINANCIAL:, OBLIGATION:, RESTRICTION:, TERMINATION:, LEGAL:, RISK:)';
COMMENT ON COLUMN rights_agreements.ai_summary IS 'AI-generated executive briefing covering deal overview, financial terms, scope, and key obligations';
```

### Verification

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rights_agreements' AND column_name IN ('key_terms', 'ai_summary')
ORDER BY column_name;
```

Expected: 2 rows — `ai_summary` (text) and `key_terms` (jsonb).

---

# 14. Email Notifications — Settings & Preferences

> **Prerequisite:** Run Migration #1 first (`get_user_role()` helper function).

This migration creates the tables needed for the email notification system:

1. **`notification_settings`** — Global notification configuration (admin-controlled)
2. **`user_notification_preferences`** — Per-user preferences (users can opt out of individual types)

### System Design

- **Admin controls**: Admins can enable/disable notification types globally
- **User choice**: Users can choose which enabled notifications to receive
- **Safety**: Users must have at least one notification type enabled (cannot disable all)
- **Always-on**: Password reset emails are always sent regardless of settings

### Step 1: Create notification_settings table

```sql
-- Global notification settings (admin-controlled)
CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_type VARCHAR(50) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    category VARCHAR(50) DEFAULT 'activity',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_type ON notification_settings(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_settings_category ON notification_settings(category);

-- Enable RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All can read, only admin can modify
CREATE POLICY "notification_settings_select" ON notification_settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "notification_settings_insert" ON notification_settings
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "notification_settings_update" ON notification_settings
    FOR UPDATE TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "notification_settings_delete" ON notification_settings
    FOR DELETE TO authenticated
    USING (public.get_user_role(auth.uid()) = 'admin');

-- Trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 2: Create user_notification_preferences table

```sql
-- User notification preferences (users can opt out of specific types)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, notification_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_type ON user_notification_preferences(notification_type);

-- Enable RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can manage their own preferences, admins can view all
CREATE POLICY "user_notification_preferences_select" ON user_notification_preferences
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "user_notification_preferences_insert" ON user_notification_preferences
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_notification_preferences_update" ON user_notification_preferences
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_notification_preferences_delete" ON user_notification_preferences
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_notification_preferences_updated_at
    BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 3: Seed default notification types

```sql
-- Insert default notification types
INSERT INTO notification_settings (notification_type, is_enabled, description, category)
VALUES
    ('rights_expiring_critical', TRUE, 'Rights expiring within 7 days (critical alert)', 'alerts'),
    ('rights_expiring_urgent', TRUE, 'Rights expiring within 30 days (urgent alert)', 'alerts'),
    ('rights_expiring_upcoming', TRUE, 'Rights expiring within 60 days (advance notice)', 'alerts'),
    ('agreement_created', TRUE, 'New agreement created in the system', 'activity'),
    ('rights_renewed', TRUE, 'Rights have been renewed', 'activity'),
    ('rights_transferred', TRUE, 'Rights have been transferred to another platform', 'activity'),
    ('movie_created', TRUE, 'New movie added to the catalog', 'activity'),
    ('daily_digest', TRUE, 'Daily summary of activity and expiring rights', 'digest'),
    ('user_created', TRUE, 'Welcome email to new users (includes credentials)', 'account'),
    ('password_reset', TRUE, 'Password reset notifications (always enabled)', 'account')
ON CONFLICT (notification_type) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category;
```

### Verification

```sql
-- Confirm tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('notification_settings', 'user_notification_preferences');

-- Confirm default notification types were seeded
SELECT notification_type, is_enabled, category FROM notification_settings ORDER BY category, notification_type;

-- Confirm RLS policies
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('notification_settings', 'user_notification_preferences')
ORDER BY tablename, cmd;
```

Expected:
- 2 tables created
- 10 notification types seeded
- 8 RLS policies (4 per table)

### Environment Variables

Add these to your `.env.local` file for email notifications to work:

```env
# Resend.com API key
RESEND_API_KEY=re_xxxxxxxxxxxx

# Sender email address (must be verified in Resend)
EMAIL_FROM="Film IP Manager <notifications@yourdomain.com>"

# Secret for cron job authentication
CRON_SECRET=your-secure-random-secret

# App URL for email links
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Scheduled Jobs (Vercel Cron)

Add this to `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/notifications/send-alerts",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/notifications/daily-digest",
      "schedule": "0 8 * * *"
    }
  ]
}
```

This will:
- Send expiring rights alerts daily at 9:00 AM UTC
- Send daily digest emails at 8:00 AM UTC

---

# Final RBAC Matrix — Reference

After all migrations are applied, this is the complete permission model:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| movies | all | admin, editor | admin, editor | admin |
| movie_cast | all | admin, editor | admin, editor | admin, editor |
| movie_directors | all | admin, editor | admin, editor | admin, editor |
| platform_rights | all | admin, legal | admin, legal | admin, legal |
| rights_history | all | admin, legal | — | — |
| rights_agreements | all | admin, legal | admin, legal | admin, legal |
| agreement_documents | all | admin, legal | admin, legal | admin, legal |
| user_profiles | own + admin | admin | own (limited), admin (any) | admin |
| platforms | all | admin, editor | admin, editor | admin |
| production_houses | all | admin, editor | admin, editor | admin |
| people | all | admin, editor | admin, editor | admin, editor |
| languages | all | admin | admin | admin |
| rights_types | all | admin | admin | admin |
| saved_reports | own rows | own rows | own rows | own rows |
| notifications | own rows | any authenticated | own rows | — |
| user_activity | own + admin | any authenticated | — | — |
| audit_logs | admin | SECURITY DEFINER | — | — |
| notification_settings | all | admin | admin | admin |
| user_notification_preferences | own + admin | own | own | own |

---

# Troubleshooting — Common Issues

This section covers common database-related errors and their solutions.

## Issue: "Could not find the agreement_value column of rights_agreements"

**Error Code:** `PGRST204`

**Cause:** The `agreement_value` column is missing from the `rights_agreements` table. This can happen if:
1. Migration #2 was not applied
2. An older version of migration #2 was applied that didn't include this column

**Fix:**

```sql
-- Add the missing agreement_value column
ALTER TABLE rights_agreements
ADD COLUMN IF NOT EXISTS agreement_value NUMERIC;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'rights_agreements' AND column_name = 'agreement_value';
```

---

## Issue: Audit Logs Table is Empty

**Symptom:** The audit log page shows "No audit log entries found" even after making changes.

**Cause:** The audit log triggers are not configured. The `audit_logs` table exists but database triggers are needed to automatically populate it.

**Fix:** Run Migration #8 (Audit Logs — Function, RLS & Triggers) from this document. Key steps:

1. Create the `log_audit_event()` function
2. Create triggers on all tables you want to audit (movies, platform_rights, rights_agreements, etc.)

After running the migration, any INSERT/UPDATE/DELETE on configured tables will automatically create entries in `audit_logs`.

**Quick Test:**

```sql
-- After applying migration #8, update any movie to trigger an audit entry
UPDATE movies SET updated_at = NOW() WHERE id = (SELECT id FROM movies LIMIT 1);

-- Check if audit log was created
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;
```

---

## Issue: saved_reports Table Does Not Exist

**Symptom:** Saving reports fails silently or shows "Failed to save report" error.

**Cause:** The `saved_reports` table from Migration #6b was not created.

**Fix:**

```sql
CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    template_id VARCHAR(100),
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON saved_reports(user_id);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_reports_select" ON saved_reports
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saved_reports_insert" ON saved_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_reports_update" ON saved_reports
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saved_reports_delete" ON saved_reports
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_reports_updated_at
    BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Issue: Movies Not Appearing in Actor/Director Filmography

**Symptom:** When viewing an actor or director's page, newly created movies with that person assigned don't appear in their filmography.

**Possible Causes:**
1. The person was added to the movie but the `movie_cast` or `movie_directors` insert failed
2. RLS policies are preventing the query from seeing the junction table records

**Diagnosis:**

```sql
-- Check if the movie-person relationship exists
SELECT mc.*, m.title as movie_title, p.name as person_name
FROM movie_cast mc
JOIN movies m ON mc.movie_id = m.id
JOIN people p ON mc.person_id = p.id
WHERE m.title ILIKE '%your_movie_title%';

-- For directors
SELECT md.*, m.title as movie_title, p.name as person_name
FROM movie_directors md
JOIN movies m ON md.movie_id = m.id
JOIN people p ON md.person_id = p.id
WHERE m.title ILIKE '%your_movie_title%';
```

**Fix:** If the relationships don't exist, you can manually insert them:

```sql
-- Find IDs
SELECT id FROM movies WHERE title = 'Your Movie Title';
SELECT id FROM people WHERE name = 'Actor Name';

-- Insert cast relationship
INSERT INTO movie_cast (movie_id, person_id, role, billing_order)
VALUES ('movie-uuid', 'person-uuid', 'Actor', 1);

-- Insert director relationship
INSERT INTO movie_directors (movie_id, person_id)
VALUES ('movie-uuid', 'person-uuid');
```

---

## Issue: Rights Not Appearing in Rights Management Page

**Symptom:** A right appears in the Expiring Rights page but not in the main Rights Management page.

**Possible Causes:**
1. The rights list is paginated (50 per page) and sorted by end_date — new rights may be on a later page
2. The search is case-sensitive or not matching

**Solution:** Use the search functionality to filter by movie title. The search now works server-side across all records, not just the current page.

---

## Issue: Supabase Schema Cache Outdated

**Symptom:** Errors like "Could not find column X in the schema cache" even after running migrations.

**Cause:** Supabase caches the database schema. After schema changes, the cache may be stale.

**Fix:**

1. **Option A: Wait** — The cache automatically refreshes every few minutes
2. **Option B: Force refresh** — In the Supabase Dashboard, go to Settings > API and click "Reload Schema Cache"
3. **Option C: Restart the project** — In Supabase Dashboard, go to Settings > General and restart the project

---

# Quick Reference — Migration Checklist

Before deploying, ensure these migrations are applied:

- [ ] Migration #0: Code columns on all tables
- [ ] Migration #1: `get_user_role()` helper function
- [ ] Migration #2: `rights_agreements` table with `agreement_value` column
- [ ] Migration #3: Rights agreements expanded fields
- [ ] Migration #4: User profiles `employee_id` column
- [ ] Migration #5: Production houses code column & RLS
- [ ] Migration #6: Missing tables (`agreement_documents`, `saved_reports`, `notifications`, `user_activity`)
- [ ] Migration #7: Views with `security_invoker = on`
- [ ] Migration #8: Audit logs function, RLS & triggers
- [ ] Migration #9: RLS policy fixes
- [ ] Migration #10: RPC functions (`renew_right`, `transfer_right`)
- [ ] Migration #11: Storage bucket policies
- [ ] Migration #12: Agreement documents label column
- [ ] Migration #13: Rights agreements AI fields
- [ ] Migration #14: Email notifications (`notification_settings`, `user_notification_preferences`)

Run this query to check which tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

---

# 15. Perpetual Dates Backfill

This migration backfills `3099-12-31` for movies and rights that have perpetual terms (stored as NULL or specific placeholders in legacy systems).

```sql
-- 1. Backfill movie-level agreement and rights periods
UPDATE movies
SET 
  agreement_end_date = COALESCE(agreement_end_date, '3099-12-31'),
  satellite_rights_end_date = COALESCE(satellite_rights_end_date, '3099-12-31'),
  internet_rights_end_date = COALESCE(internet_rights_end_date, '3099-12-31')
WHERE LOWER(title) IN (
  'aami aar amar girlfriends', 'aborto', 'agni yudha', 'agnisakshi',
  'amar bodyguard', 'amar sanghee', 'ami achi sei je tomar',
  'ami o amar madhuri', 'ami vs tumi', 'antarleen',
  'toofan' -- ... and others from fix_perpetual_dates.sql
);

-- 2. Backfill platform rights end dates
UPDATE platform_rights
SET end_date = '3099-12-31'
WHERE is_current = true 
AND end_date IS NULL
AND movie_id IN (SELECT id FROM movies WHERE source = 'home_production');
```
