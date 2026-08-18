# Supabase backend

Schema, roles, RLS and Realtime for The Traders Planet App. This is the
**backend foundation only** — the screens under `src/screens/` still run on
local component state and are not wired to any of this yet (that's Phase 2B).

## What's here

- `migrations/20260818120000_backend_foundation.sql` — the whole schema in one
  migration: enums, tables, indexes, helper functions, triggers, RLS policies,
  and the Realtime publication grants. It's the first migration for this
  project and only creates new objects.

## Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per `auth.users`, created automatically on signup. Holds `role` (`admin` \| `student`), `full_name`, `phone`, `reveal_identity` (default "post with my real name" preference). |
| `posts` | Community posts. `channel` is `official` (admin-only, e.g. Gold Analysis signals) or `students`. `is_anonymous` + `display_name` implement the "Unknown User" masking — see below. |
| `comments` | Replies to a post; text or a voice note (`voice_url` + `voice_duration_seconds`). Same anonymity model as posts. |
| `likes` / `bookmarks` | Join tables keyed on `(post_id, user_id)`. Likes are visible to everyone (for counts); bookmarks are private to their owner. |
| `conversations` | One row per student — their single thread with Admin ("direct member chat is off", so there's no student↔student messaging). |
| `messages` | Belongs to a conversation; `kind` covers text/image/pdf/chart/voice. |
| `notifications` | Per-user feed. Rows are only ever written by triggers (new official post, new message, new comment, new like) — there is no insert policy for regular users. |

## The "Unknown User" identity model

A student can post anonymously. Other students must never learn who they
really are, but **admins always see the real name**, even on anonymous posts.

RLS can restrict which *rows* a user sees, but it can't mask one *column*
differently per viewer within the same row. So instead of doing per-viewer
joins at read time, `posts.display_name` (and `comments.display_name`) is
snapshotted once, at write time, by the `snapshot_display_name()` trigger:

- `is_anonymous = true` → `display_name = 'Unknown User'`
- `is_anonymous = false` → `display_name = <the author's name at that time>`

Everyone can read `display_name` directly — no extra query needed. Admins
additionally have standing access to every row in `profiles` (see
`profiles_select_own_or_admin`), so an admin client can resolve
`posts.author_id → profiles.full_name` itself to get the real name
regardless of `is_anonymous`. A student attempting the same join for another
student's `author_id` is blocked by `profiles` RLS and falls back to
`display_name`.

## Roles

`profiles.role` is `student` by default. `is_admin(uid)` is a
`security definer` SQL function used throughout the RLS policies (it has to
be `security definer` so it can read `profiles` without recursing back into
`profiles`'s own RLS check). Promoting a student to admin requires an
existing admin — `prevent_role_self_escalation()` blocks anyone else from
changing `role` on their own row.

There is currently no admin UI for granting the first admin: run this once
against a real user after they sign up, from the SQL editor or CLI with your
service_role key:

```sql
update public.profiles set role = 'admin' where id = '<user-uuid>';
```

## Realtime

`posts`, `comments`, `likes`, `messages`, and `notifications` are added to the
`supabase_realtime` publication, so `supabase.channel(...).on('postgres_changes', ...)`
subscriptions work for the community feed, chat, and the notification bell
once the frontend is wired up. `profiles`, `bookmarks` and `conversations`
are intentionally left out — nothing in the current screens needs to observe
those live.

## Applying the migration

With the Supabase CLI, linked to your project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste the migration file into the SQL editor in the Supabase dashboard.

## Environment variables

Copy `.env.example` → `.env` and fill in the two Supabase values from
Settings → API in your project:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

`src/lib/supabase.ts` reads these and exports a typed `supabase` client
(`src/lib/database.types.ts` mirrors this schema). The anon key is safe to
ship to the browser — every table it can reach is governed by the RLS
policies above. Never put a `service_role` key in a `VITE_*` variable or any
other file that ships to the client; a privileged server-side client can be
added in a later phase if a feature genuinely needs one.
