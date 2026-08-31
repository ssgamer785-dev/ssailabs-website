# Regency Tailor — Supabase setup

The showroom database is PostgreSQL on Supabase. Sign-in is Google, and only
accounts on the showroom's allowlist can see any data.

There is exactly one application role: **Admin**. Every authorised account has
full access to customers, orders, garments, measurements, production slips,
bills, payments, expenses, workers, trash, backup/restore, showroom settings
and staff management.

---

## 1. Create the project

1. Create a Supabase project (any region near Jalandhar; `ap-south-1` is closest).
2. **Settings → API** — copy the **Project URL** and the **anon public** key.

> Never copy the **service_role** key into this application. It bypasses Row
> Level Security completely. It is not needed anywhere in this repository.

## 2. Turn off public sign-up

**Authentication → Sign In / Providers**

- Disable **Allow new users to sign up**.
- Enable the **Google** provider and paste the Client ID and Client Secret from
  a Google Cloud OAuth 2.0 Web Client.
- In Google Cloud, set the authorised redirect URI to
  `https://<your-project>.supabase.co/auth/v1/callback`.
- Add your application's URL to **Authentication → URL Configuration → Redirect URLs**.

Even with sign-up disabled, treat authentication and authorisation as separate:
anyone with a Google account may be able to obtain a session. What decides
access is the allowlist in step 4, enforced by the database.

## 3. Apply the migrations

In **SQL Editor**, run the files in `supabase/migrations/` in filename order:

| File | What it creates |
| --- | --- |
| `20260827000000_schema.sql` | Tables, constraints, indexes, order-number sequence |
| `20260827000001_functions_triggers_views.sql` | Access gate, triggers, derived views |
| `20260827000002_rls.sql` | Row Level Security policies and grants |
| `20260827000003_backup_restore.sql` | Atomic export/restore functions |
| `20260827000004_seed_settings.sql` | Showroom address (Bootan Mandi) |
| `20260829000000_rebrand_showroom_settings.sql` | Updates an already-deployed settings row to REGENCY TAILOR / 144003 |
| `20260831000000_backup_settings_and_audit.sql` | Backup exports the audit log; restore also restores showroom settings |

Or with the Supabase CLI:

```bash
supabase db push
```

To undo everything, `supabase/down/20260827_rollback.sql` drops it all. Take a
`pg_dump` first — it is destructive.

## 4. Authorise the showroom account

Nothing is authorised by default. In the **SQL Editor**, run this once with the
real Google address:

```sql
select public.authorize_admin('owner@gmail.com', 'Showroom Owner');
```

To authorise another device owner later, run it again with their address. To
revoke access without deleting history:

```sql
update public.staff_profiles set is_active = false where email = 'someone@gmail.com';
```

An account that signs in without an active row here gets a valid session and
**no data at all** — the app says so on screen rather than showing an empty
dashboard.

## 5. Set the showroom's tax number

The migration deliberately leaves this blank rather than guessing:

```sql
update public.showroom_settings set gstin = '<real GSTIN>';
```

## 6. Point the application at the project

Create `.env.local` (never commit it):

```
VITE_SUPABASE_URL="https://<your-project>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon public key>"
```

```bash
npm install
npm run dev        # http://localhost:3000
```

## 7. Move existing browser data across

If the showroom has been using the browser-storage build, sign in on **that
same browser** and open **Backup & Recovery**. A card offers to migrate the
existing records, showing exactly what will be copied and anything that needs
attention first.

The migration never runs on its own, and **it does not delete the browser
copy** — that copy is the rollback if anything looks wrong.

---

## How access is enforced

| Layer | What it does |
| --- | --- |
| Sign-in screen | Keeps the dashboard off screen until a session exists. Convenience only. |
| `anon` role | Holds **no privileges** on any business table — refused before RLS is consulted. |
| RLS policies | Every table delegates to `public.is_authorized_admin()`, which requires an active `staff_profiles` row. |
| Views | Created `WITH (security_invoker = true)` so they cannot read around RLS. |
| RPCs | `export_backup` and `restore_backup` re-check authorisation inside the function. |

A forged role claim in a JWT changes nothing: authorisation is read from the
database, never from the token's contents. That is covered by a test.

## Order numbers

Issued by `order_number_seq` with a `UNIQUE` constraint. Safe across devices
and concurrent sessions by construction. Numbers are never re-used — deleting
an order does not return its number to the pool, because a number already
printed on a bill must never reappear on a different customer's paperwork.

## Data retention

Nothing in this database expires. There is no scheduled job, no TTL and no
automatic purge: a customer created today is still there in ten years unless an
Admin deletes them. Deletions are soft (`deleted_at`) and sit in Trash until an
Admin empties it, and an order's customer cannot be removed at all while the
order exists (`on delete restrict`). The audit log has no UPDATE or DELETE
grant for anyone, so it only ever grows.

That is separate from Supabase's own backup retention and project-pausing
behaviour, which are plan-level settings in their dashboard.

## Backup and restore

- **Export** downloads a `.regency.backup` file containing the exact database
  payload plus readable collections. Backups contain business data only — no
  keys, tokens or credentials.
- **Import** validates the file, writes a safety snapshot to `backup_snapshots`,
  then replaces everything **inside one transaction**. Any failure rolls the
  whole thing back; production is never left half-replaced.
- Files exported by the older browser-storage build still import: they are
  converted on the way in.

## Running the tests

```bash
npm test            # business-logic unit tests
npm run test:db     # schema + RLS + restore, against a throwaway PostgreSQL
npm run dev:local   # browser-storage mode, for the E2E suite
npm run test:e2e    # full workflow in a real browser
```

`npm run test:db` needs the PostgreSQL **server** binaries (`postgresql-16` on
Debian/Ubuntu). It never touches your Supabase project.
