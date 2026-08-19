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

## Chat (Phase 2C)

`20260819090000_chat_message_kind_video.sql` adds `video` to the message-kind
enum — separate from the next file because Postgres won't let a new enum value
be *used* in the transaction that adds it.

`20260819090100_chat_production.sql` turns the Student↔Admin thread into a real
chat: attachment metadata, idempotent sends, soft delete, and media accounting.

- **Idempotent sends.** Every outgoing message carries a client-generated
  `client_id`, unique per conversation. A retried send collides instead of
  posting twice, and the optimistic bubble reconciles with the row that arrives
  over Realtime.
- **Who may change what.** RLS can't express "only these columns", so
  `guard_message_update()` draws the line: the sender may soft-delete their own
  message (never edit it), and the other participant may only set `read_at`.
  Without this, the foundation migration's update policy would have let either
  side rewrite the other's messages.
- **`auth.uid() is null` means "not an end-user request".** Every messages
  policy is `to authenticated`, so a null uid can only be our own server
  (service-role) or the SQL editor. The guards deliberately allow that through —
  it's how FIFO purging and the first-admin bootstrap work.
- **100 MB per student, FIFO.** `conversations.media_bytes_used` is kept in sync
  by trigger. When it goes over, the server calls
  `select_chat_media_to_purge()` (oldest first), deletes those objects from R2,
  then calls `mark_chat_media_purged()`. Splitting it in two means a failed R2
  call can't leave the database claiming space is free. The message row
  survives with `media_purged = true` so the thread keeps its shape.

Typing indicators and presence ride Realtime **broadcast** on the per-thread
channel — no table, nothing persisted.

### Cloudflare R2

Chat attachments (images, video, PDFs, voice notes) live in a **private** R2
bucket. The browser never holds R2 credentials or a durable URL: `server/chat-media.ts`
issues short-lived signed PUT/GET URLs after verifying the caller's Supabase JWT
*and* their membership of the conversation. Upload keys are generated
server-side (`chat/<conversationId>/…`), so a client can't choose where its
bytes land, and `ContentType`/`ContentLength` are part of the signature, so an
upload can't exceed the size that was validated.

Create the bucket, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and `SUPABASE_SERVICE_ROLE_KEY` (all
server-only — never `VITE_`-prefixed). The bucket needs CORS allowing `PUT`
from your app origin:

```json
[{ "AllowedOrigins": ["https://your-app-domain"],
   "AllowedMethods": ["PUT", "GET"],
   "AllowedHeaders": ["content-type"],
   "MaxAgeSeconds": 3000 }]
```

If R2 is unset the media endpoints return 503 and text chat keeps working.

## Community + notifications (Phase 2D)

`20260819140000_community_production.sql` connects the Community and
Notifications screens to real data.

- **One query per feed page.** `posts_feed(channel, before, limit)` returns the
  page together with each post's author, like/comment counts and
  `liked_by_me`. Doing that client-side would be a query per post per counter.
  `post_comments(post_id, before, limit)` is the same idea for a thread. Both
  are SECURITY INVOKER, so posts/comments RLS still decides visibility.
- **Anonymity carries through.** `author_name` resolves to the real profile
  name for admins and to the snapshotted `display_name` for everyone else —
  the same rule as Phase 2A, now applied inside the feed reader.
- **Notification triggers already existed** (new official post, new comment,
  new like, new chat message) from Phases 2A/2C. This migration adds
  `my_unread_notification_count()` for the badge and
  `mark_all_notifications_read()` for the header action.

Post attachments use the same private-R2 pattern as chat, via `/api/posts`:
reads are open to any signed-in member (posts are readable to all members
anyway), writes are namespaced to the uploader (`posts/<userId>/…`), and
deletes require the post's author or an admin.

### 6-month retention

**This rule did not exist before Phase 2D — this migration establishes it.**
Nothing in the earlier phases expired anything.

`purge_expired_posts()` deletes community posts older than
`community_retention_cutoff()` (now − 6 months); comments and likes follow via
`ON DELETE CASCADE`. Because the R2 objects live outside the database, run the
sweep through `POST /api/posts/run-retention` (admin token required), which:

1. calls `select_expired_post_media()` for the keys still referenced,
2. deletes those objects from R2,
3. calls `purge_expired_posts()` to remove the rows.

Calling `purge_expired_posts()` on its own is safe but leaves the bucket
paying for orphaned files, so prefer the endpoint. If `pg_cron` is enabled on
the project the migration also schedules the SQL half nightly at 03:15 UTC as
a backstop; on projects without the extension that block is skipped and the
endpoint is the only path.

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
