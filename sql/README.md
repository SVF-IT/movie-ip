# Film IP Dashboard — Database SQL Files

## Two ways to recreate the database

### Option A — Fresh project (numbered files, run in order)

Run each file in numeric order in the Supabase SQL editor (or via `psql`).
Each file is self-contained: table + indexes + triggers + RLS + seed data.

| File | What it creates |
|------|----------------|
| `00_extensions_and_helpers.sql` | uuid-ossp extension, `update_updated_at_column()`, `get_user_role()` |
| `01_production_houses.sql` | `production_houses` table + RLS |
| `02_people.sql` | `people` table (actors + directors) + RLS |
| `03_platforms.sql` | `platforms` table + RLS + seed data |
| `04_rights_types.sql` | `rights_types` table + RLS + seed data |
| `05_rights_nature_types.sql` | `rights_nature_types` table + RLS + seed data |
| `06_movies.sql` | `movies` table (all columns) + indexes + audit triggers + RLS |
| `07_movie_people.sql` | `movie_people` junction (cast + directors) + enriched audit trigger + RLS |
| `08_platform_rights.sql` | `platform_rights` table + indexes + audit triggers + RLS |
| `09_rights_history.sql` | `rights_history` table + index + audit trigger + RLS |
| `10_rights_agreements.sql` | `rights_agreements` table + wires FK to `platform_rights` + audit triggers + RLS |
| `11_agreement_documents.sql` | `agreement_documents` table + soft-delete indexes + audit triggers + RLS |
| `12_user_profiles.sql` | `user_profiles` table + audit triggers + RLS |
| `13_movie_approvals.sql` | `movie_approvals` table + RLS |
| `14_audit_logs.sql` | `audit_logs` table + RLS |
| `15_views_and_functions.sql` | All views + `renew_right` + `transfer_right` + `update_expired_rights` RPCs |
| `16_notifications.sql` | `notifications` inbox + `notification_settings` (global) + `user_notification_preferences` + seed data |
| `17_movie_pending_changes.sql` | `movie_pending_changes` table — editor change submissions pending admin/legal approval |

> **Run order matters.** Files 08–11 reference tables created in earlier files.
> `audit_logs` (14) must exist before movies triggers (06) fire, so in the
> numbered order the table is created first, and `log_audit_event()` is defined
> inline in `06_movies.sql` before the triggers that use it.

### Option B — Single file

Run `schema_current_state.sql` — everything in one shot for a fresh project.

---

## Incremental migration (existing live DB only)

If the live database already has all tables but is missing the new rights fields
added in May 2025, run:

```
migrate_rights_fields_v2.sql
```

This adds the following columns to `movies` with `IF NOT EXISTS` (safe to re-run):
- `satellite_rights`, `internet_rights`, `negative_rights`, `other_rights`
- `satellite_rights_classification`
- `holdbacks`
- `clip_rights`, `clip_rights_duration`
- `nature_of_satellite_rights`, `nature_of_internet_rights`, `nature_of_negative_rights`, `nature_of_other_rights`
- `negative_rights_start_date`, `negative_rights_end_date`
- `other_rights_start_date`, `other_rights_end_date`

---

## Notes

- All `nature` / `certification` columns are stored as `TEXT` (no ENUM types).
- Cast and directors are unified in `movie_people` — there are no `movie_cast`
  or `movie_directors` tables.
- `language` and `production_house_name` are plain TEXT columns on `movies`
  (no separate FK tables for these).
- Holdbacks are stored as `"on VALUE1,VALUE2"` — the `"on "` prefix is always present.
- `fvod_holdback` and `avod_holdback` columns are kept on `movies` for
  backward compatibility with older records; the UI no longer writes to them.
