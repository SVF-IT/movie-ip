# SVF sign-in standard

Every SVF app (Tritiya pillars and any new tool) signs people in the same way, so an SVF person uses the same SVF identity everywhere. The reference implementation is **SVF Socials** (`socials.svf.in`). Copy from it rather than reinventing.

## The rules

1. **Supabase Auth**, one Supabase project per app. Each app keeps its own users table and its own roles. Only the *sign-in* is shared.
2. **Invite-only.** In Supabase, "Allow new users to sign up" is **off**. People exist only if an admin added them in the app.
3. **SVF staff sign in with Microsoft** ("Sign in with SVF", Supabase provider `azure`), using SVF's shared Entra app registration. Their password is typed on Microsoft's page, never in our app.
4. **Outsiders** (distributors, agencies, partners) sign in with **email + password**, set by them from an invite link.
5. **Internal domains** live in an `internal_domains` table (today: `svf.in`). Emails on those domains:
   - are created **without a password**
   - can't sign in with a password, and can't use "forgot password"
   - Exception: while the env var `ALLOW_INTERNAL_PASSWORD=true` is set (before Microsoft is configured, or during the switch-over)
6. **Same email = same person.** When an SVF person first uses Microsoft, Supabase attaches Microsoft to their existing user because the verified email matches. User ID, profile and role stay the same. Emails in the app must exactly match their Microsoft email.
7. **Not added = no access.** If Microsoft returns someone who isn't in the app, or who is turned off, they're signed out and shown "Ask the admin to add you".
8. **Leaving SVF:** IT disables the Microsoft account, so the person is locked out everywhere. Turning someone off in an app also bans them in Supabase Auth.

## What every app must have

**Database**
- `internal_domains(domain citext primary key)` with `svf.in`
- `is_internal_email(e text)` function (security definer)
- `user_profiles`: `id` (FK auth.users), `email`, `full_name`, `user_type` ('internal' | 'external'), `role`, `is_active`, `must_change_password`, timestamps
- Trigger on `auth.users` insert that creates an **inactive** profile
- Trigger blocking non-admins from changing `role`, `is_active`, `user_type`, `email`, `must_change_password`
- RLS on every table. Normal users have **no** update/insert policy on `user_profiles`; the server changes profiles with the service role.

**Routes and pages**
- Login page: a **"Sign in with SVF"** button (`signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: <origin>/auth/callback } })`) plus an email + password form for outsiders
- `/auth/callback`: exchanges the code, then checks the profile exists and is active. Otherwise signs out and redirects to "no access". Handles `?error=` (e.g. sign-up disabled → "not invited").
- `/auth/confirm`: invite and reset links using `token_hash` + `verifyOtp` (works in any browser)
- Password login through a server route that refuses internal domains (unless `ALLOW_INTERNAL_PASSWORD`)
- Forgot-password route that refuses internal domains (unless `ALLOW_INTERNAL_PASSWORD`)
- Admin "add user": internal email → `auth.admin.createUser({ email, email_confirm: true })` with **no password**; external → `inviteUserByEmail`
- Turning a user off → `updateUserById(id, { ban_duration: "876000h" })`; back on → `"none"`
- Proxy/middleware **fails closed** (any Supabase error = no access). Every API route checks the caller itself.
- Admin users page shows how each person signs in (Microsoft / password), from `auth.identities`.

**Supabase dashboard**
- Authentication → Sign In / Providers: sign-up **off**; Email on; **Azure on** with the shared Client ID + secret; Azure Tenant URL `https://login.microsoftonline.com/<SVF_TENANT_ID>`
- Authentication → URL Configuration: Site URL = the app's URL; Redirect URLs include `https://<app-domain>/**` and `http://localhost:3000/**`
- Email templates: invite → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`; reset → `…&type=recovery`
- SMTP: Resend, sending from a subdomain of svf.in

**IT (once per new app)**
Ask IT to **add one redirect URI** to the shared Entra app registration "SVF Socials / SVF Apps":
`https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
Then reuse the same Client ID, secret and Tenant URL in the new Supabase project. When the secret is renewed, update it in **every** project.

## Switching an existing app over (users who already have passwords)
1. Ship the Microsoft button with `ALLOW_INTERNAL_PASSWORD=true`, so both ways work.
2. Check that every internal user's email matches their Microsoft email (see the SQL below). Fix any mismatches in the app.
3. Wait until every internal user has signed in with Microsoft at least once.
4. Remove `ALLOW_INTERNAL_PASSWORD`, then run the one-off script that gives internal users a random unknown password (so passwords can't be used even through the Supabase API).
5. External users (distributors etc.) are unaffected.

```sql
-- Who has used Microsoft yet (internal users)
select u.email, array_agg(distinct i.provider) as methods, max(i.last_sign_in_at) as last_sign_in
from auth.users u left join auth.identities i on i.user_id = u.id
where split_part(lower(u.email),'@',2) in (select domain::text from public.internal_domains)
group by u.email order by 2, 1;
```

## Line to put in every new project's CLAUDE.md
> **Auth follows `SVF_AUTH_STANDARD.md`** (copied in this repo). SVF staff sign in with Microsoft through the shared Entra app; outsiders use email + password; invite-only; one `user_profiles` table with `user_type`, `role`, `is_active`, `must_change_password`. The reference code is SVF Socials: `src/proxy.ts`, `src/lib/auth/*`, `src/app/auth/*`, `src/app/api/auth/*`, `src/app/api/admin/users/*`, `supabase/migrations/0001_auth.sql`. This app's own roles are: …
