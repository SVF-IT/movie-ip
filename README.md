# Film IP Manager — Frontend

Next.js 16 application for the Film IP Management System.

---

> **BEFORE VERCEL DEPLOY: Always run pending migrations from [sql-migration.md](sql-migration.md) first!**
>
> **Deploy Order:** GitHub Push → Run SQL Migrations → Refresh Supabase Schema Cache → Vercel Deploy

---

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Notifications (Resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM="Film IP Manager <notifications@yourdomain.com>"
CRON_SECRET=your-secure-random-secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start development server (Turbopack) |
| `npm run build` | Production build                     |
| `npm run start` | Start production server              |
| `npm run lint`  | Run ESLint                           |

## Architecture

### App Router Structure

```
src/app/
├── (auth)/                      # Auth group (no sidebar)
│   ├── login/                   # Login page
│   └── change-password/         # First-login & password change
├── (dashboard)/                 # Main app group (with sidebar)
│   ├── page.tsx                 # Dashboard home
│   ├── movies/                  # Movie catalog & details
│   ├── rights/                  # Platform rights management
│   ├── expiring-rights/         # Expiring rights monitor
│   ├── actors/                  # Actor listing
│   ├── directors/               # Director listing
│   ├── platforms/               # Platform listing
│   ├── people/                  # People listing
│   ├── agreements/              # Rights agreements
│   ├── audit-log/               # Audit log viewer
│   ├── reports/                 # Report builder
│   ├── settings/
│   │   └── notifications/       # User notification preferences
│   └── admin/
│       ├── users/               # User management (admin only)
│       └── notifications/       # Global notification settings (admin only)
└── api/
    ├── admin/
    │   ├── create-user/         # User creation endpoint
    │   └── reset-password/      # Password reset endpoint
    ├── import/                  # CSV import handler (supports "Perpetual" dates)
    ├── export/                  # CSV export handler
    ├── dubbed/                  # Dubbed versions and restrictions tracking
    └── notifications/
        ├── settings/            # Global notification settings API
        ├── preferences/         # User notification preferences API
        ├── send-alerts/         # Cron endpoint for expiring alerts
        └── daily-digest/        # Cron endpoint for daily digest
```

### Key Libraries

| Library         | Purpose                     |
| --------------- | --------------------------- |
| `@supabase/ssr` | Server-side Supabase client |
| `@radix-ui/*`   | Accessible UI primitives    |
| `tailwindcss`   | Utility-first CSS           |
| `recharts`      | Dashboard charts            |
| `@nivo/*`       | Advanced visualizations     |
| `zod`           | Schema validation           |
| `lucide-react`  | Icons                       |
| `resend`        | Email notifications         |

### Middleware

The middleware (`src/middleware.ts`) handles:

- Auth session verification on all protected routes
- Redirect to `/login` for unauthenticated users
- Redirect to `/change-password` for users with `must_change_password` flag
- Admin role check for `/admin/*` routes
- Inactive user detection and sign-out
- Static asset bypass (images, fonts, etc.)

### Validation

All input validation is centralized in `src/lib/validations/schemas.ts` using Zod:

- `createUserSchema` — User creation (email, password, full name, employee ID, role, department)
- `movieSchema` — Movie create/edit
- `createRightSchema` — Rights creation
- `renewRightSchema` / `transferRightSchema` — Rights operations
- `importFileSchema` — CSV import validation

### Type Definitions

TypeScript interfaces in `src/lib/types/database.ts`:

- `Movie`, `MovieWithDetails`
- `PlatformRight`, `RightsHistory`
- `RightsAgreement`, `AgreementDocument`
- `UserProfile` (with `employee_id`)
- `Platform`, `Person`, `Language`, `ProductionHouse`
- `DashboardStats`, `ExpiringRight`
- `AuditLog`, `AuditLogStats`

### RBAC

Role-based access is enforced at three levels:

1. **Middleware** — route-level protection
2. **API routes** — server-side role verification
3. **UI components** — conditional rendering based on user role

### Email Notifications (Resend Integration)

The system includes comprehensive email notifications powered by [Resend.com](https://resend.com).

#### Resend Setup

1. **Create Resend Account**: Sign up at [resend.com](https://resend.com)
2. **Get API Key**: Dashboard > API Keys > Create API Key
3. **Verify Domain**: Add DNS records for your sending domain (required for production)
4. **Add Environment Variables**: See below

#### Environment Variables for Email

```env
# Resend API Key (required)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Sender email address - must be from a verified domain in Resend
EMAIL_FROM="Film IP Manager <notifications@yourdomain.com>"

# Secret for authenticating cron job requests
CRON_SECRET=generate-a-secure-random-string-here

# Your app's public URL (used in email links)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

#### API Endpoints

| Endpoint                          | Method | Auth  | Description                              |
| --------------------------------- | ------ | ----- | ---------------------------------------- |
| `/api/notifications/settings`     | GET    | Admin | Get global notification settings         |
| `/api/notifications/settings`     | PUT    | Admin | Update global notification setting       |
| `/api/notifications/preferences`  | GET    | User  | Get user's notification preferences      |
| `/api/notifications/preferences`  | PUT    | User  | Update user's notification preference    |
| `/api/notifications/send-alerts`  | POST   | Cron  | Send expiring rights alerts (daily cron) |
| `/api/notifications/daily-digest` | POST   | Cron  | Send daily digest emails (daily cron)    |

#### Notification Types

| Category | Type                       | Description                                   |
| -------- | -------------------------- | --------------------------------------------- |
| Alerts   | Rights Expiring (Critical) | Rights expiring within 7 days                 |
| Alerts   | Rights Expiring (Urgent)   | Rights expiring within 30 days                |
| Alerts   | Rights Expiring (Upcoming) | Rights expiring within 60 days                |
| Activity | Agreement Created          | New agreement added                           |
| Activity | Rights Renewed             | Rights renewal notification                   |
| Activity | Rights Transferred         | Rights transfer notification                  |
| Activity | Movie Created              | New movie added to catalog                    |
| Digest   | Daily Digest               | Daily summary of activity and expiring rights |
| Account  | User Created               | Welcome email with credentials                |
| Account  | Password Reset             | Password reset notification (always on)       |

#### Configuration Pages

- **Admin** (`/admin/notifications`): Configure which notification types are globally available
- **Users** (`/settings/notifications`): Choose which enabled notifications to receive (users cannot disable all notifications)

#### Scheduled Jobs (Vercel Cron)

Add to `vercel.json` in project root for automated alerts:

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

- **send-alerts**: Runs daily at 9:00 AM UTC — sends expiring rights alerts
- **daily-digest**: Runs daily at 8:00 AM UTC — sends activity summary

#### Code Structure

```
src/lib/email/
├── resend.ts              # Resend client wrapper
├── templates.ts           # Email HTML templates
└── notification-service.ts # Business logic for sending notifications

src/app/api/notifications/
├── settings/route.ts      # Admin settings API
├── preferences/route.ts   # User preferences API
├── send-alerts/route.ts   # Cron: expiring rights alerts
└── daily-digest/route.ts  # Cron: daily digest
```

#### Database Tables Required

Run **Migration #14** from [sql-migration.md](sql-migration.md#14-email-notifications--settings--preferences):

- `notification_settings` — Global admin-controlled settings
- `user_notification_preferences` — Per-user preferences

## Database Migrations

See [sql-migration.md](sql-migration.md) for pending DBA migration instructions, including:

- Rights agreements expanded fields (25 columns for BI/financial analytics)
- User profiles `employee_id` column (mandatory, unique)
- Email notification tables (`notification_settings`, `user_notification_preferences`) - Migration #14

## Troubleshooting

### Common Issues

| Issue                                                            | Cause                                 | Solution                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agreement creation fails with "agreement_value column not found" | Migration #2 not applied              | Run the `agreement_value` column fix from [sql-migration.md](sql-migration.md#issue-could-not-find-the-agreement_value-column-of-rights_agreements) |
| Audit logs page is empty                                         | Audit triggers not configured         | Run Migration #8 from [sql-migration.md](sql-migration.md#8-audit-logs--function-rls--triggers)                                                     |
| Report save fails silently                                       | `saved_reports` table missing         | Run Migration #6b from [sql-migration.md](sql-migration.md#6b-saved_reports)                                                                        |
| Movies not in actor filmography                                  | Cast/director relationships not saved | Check `movie_cast` table entries, see [troubleshooting](sql-migration.md#issue-movies-not-appearing-in-actordirector-filmography)                   |
| Rights not appearing in list                                     | Pagination (50/page) or search issue  | Use server-side search by movie title                                                                                                               |
| Schema cache errors                                              | Supabase cache stale after migrations | Refresh schema cache in Supabase Dashboard                                                                                                          |
| Notification settings page empty                                 | `notification_settings` table missing | Run Migration #14 from [sql-migration.md](sql-migration.md#14-email-notifications--settings--preferences)                                           |
| Emails not sending                                               | `RESEND_API_KEY` not set              | Add Resend API key to environment variables                                                                                                         |

### Quick Database Health Check

Run these queries in Supabase SQL Editor to verify your setup:

```sql
-- Check all required tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'movies', 'platform_rights', 'rights_agreements', 'agreement_documents',
  'saved_reports', 'audit_logs', 'user_activity', 'notifications',
  'movie_cast', 'movie_directors', 'people', 'platforms', 'languages',
  'notification_settings', 'user_notification_preferences'
)
ORDER BY table_name;

-- Check agreement_value column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'rights_agreements' AND column_name = 'agreement_value';

-- Check audit triggers exist
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE 'audit_%'
ORDER BY event_object_table;
```

### Workflow Notes

- **Creating Movies with Cast/Crew**: After creating a new movie, you'll be redirected to the edit page where you can add actors and directors.
- **Creating Actors/Directors**: Use the "Add Person" button on the People page, or create them inline when adding cast to a movie.
- **Rights Search**: Search works server-side across all records, so you can find any movie's rights regardless of pagination.

## Recent Updates

### v2.7 (Latest)

- **Perpetual Dates Support**: Dates marked as "Perpetual" in CSV imports are now automatically stored as `3099-12-31`.
- **Bulk Import Enhancements**: Improved date parsing for comprehensive imports.
- **Dubbed Movies Filter**: Added "Cannot be Dubbed" filter and improved restriction logic.

### v2.6

- **Email Notifications**: Full email notification system using Resend.com
  - Admin notification settings (`/admin/notifications`)
  - User notification preferences (`/settings/notifications`)
  - Scheduled alerts for expiring rights (daily cron)
  - Daily digest with activity summary
  - Templates for all major events (agreements, rights, movies, users)
- **Notification Preferences**: Users can choose which notifications to receive (but cannot disable all)

### v2.5

- **Expiring Rights Actions**: Renew and Transfer buttons restored on the expiring rights page
- **Report Builder Feedback**: Save errors now display properly instead of failing silently
- **Create Actor/Director**: "Create new" option now always visible when searching (not just when no results)
- **Rights Search**: Server-side movie title search for accurate filtering across all pages
- **People Page**: Add Person dialog now functional

# Open Titles Logic — Satellite & Internet

Pre-conditions applied to ALL movies before any mode-specific check:

- `approval_status = 'approved'`
- `nature_of_rights` must NOT contain "sold" or "grassroot"
- `agreement_end_date` must be null OR >= today

---

## SATELLITE MODE

### Home Production

A home movie is **open** when ALL of the following are true:

1. `certification` is one of: U, UA, U/A
2. Has **no active** satellite-type entry in `platform_rights` (`is_current = true` and type name contains "satellite")

### Acquired

A acquired movie is **open** when ALL of the following are true:

1. `primary_rights_acquired` contains "Satellite" OR "Negative Rights"
2. **Two-tier platform_rights check:**
   - **If satellite `platform_rights` rows exist for this movie:**
     → Open only if ALL of those rows have `end_date < today` (every deal is expired)
   - **If NO satellite `platform_rights` rows exist:**
     → Fall back to the movie-level field `satellite_rights_end_date`:
     - `end_date` exists AND `end_date >= today` → **Open** (rights still valid, no platform deal logged yet)
     - `end_date` is null/empty OR `end_date < today` → **NOT open**

---

## INTERNET MODE

### Home Production

A home movie is **open** when:

- Has **no active** SVOD/internet-type entry in `platform_rights` (`is_current = true`, type name contains "svod" or "internet"), **excluding** Hoichoi deals

### Acquired

A acquired movie is **open** when ALL of the following are true:

1. `primary_rights_acquired` contains "Internet" OR "Negative Rights"
2. **Two-tier platform_rights check** (SVOD/internet-type rows only, Hoichoi excluded):
   - **If internet `platform_rights` rows exist for this movie:**
     → Open only if ALL of those rows have `end_date < today` (every deal is expired)
   - **If NO internet `platform_rights` rows exist:**
     → Fall back to the movie-level field `internet_rights_end_date`:
     - `end_date` exists AND `end_date >= today` → **Open**
     - `end_date` is null/empty OR `end_date < today` → **NOT open**

---

## Notes

- The same logic runs in two functions: `getRightsModeStats` (stat cards) and `getOpenTitlesForMode` (table)
- "Active" for a platform_rights row = `end_date IS NULL` OR `end_date >= today`
- Hoichoi is excluded from internet checks because it is an in-house platform (SVF-owned)
- `is_current` filter is applied only for home production's platform_rights check; for acquired the full history is checked to detect any active deal
# movies-ip
