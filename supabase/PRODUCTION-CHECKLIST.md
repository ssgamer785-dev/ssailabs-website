# Going live: connecting the real Supabase project and R2 bucket

Everything in this repository has been verified against a throwaway Postgres 16
and a local production build. What has **not** been done — because no
credentials for them exist in the development environment — is any of the work
that requires the real project and the real bucket. This file is the exact
sequence for that, and what to look for at each step.

Nothing here changes the schema or the app. It is connection and verification.

## 1. Environment variables

Copy `.env.example` to `.env` on the server and fill it in.

Client-safe (bundled into the browser, protected by RLS):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Server-only. **Never** give any of these a `VITE_` prefix — that would compile
them into the browser bundle:

```
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=traders-planet-chat
```

Verify after building: `grep -c 'service_role\|cloudflarestorage' dist/assets/*.js`
must print `0`.

## 2. Apply the migration chain

Five migrations, in filename order. They are additive and idempotent-ish; the
chain has been verified to apply cleanly from an empty database.

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Then confirm the deployment inventory against the live database — the same
checks `supabase/tests/30-schema-inventory.sql` runs locally: RLS on every
table, one policy minimum per table, all 18 RPCs, the six paging indexes,
Realtime publication membership, `replica identity full`, the nine guard
triggers, the 6-month window, and the quota columns.

## 3. Bucket configuration

Create the bucket **private** — the app never serves a public URL, only
short-lived signed ones. It needs CORS allowing the browser to `PUT` directly:

```json
[{ "AllowedOrigins": ["https://your-app-domain"],
   "AllowedMethods": ["PUT", "GET"],
   "AllowedHeaders": ["content-type"],
   "MaxAgeSeconds": 3000 }]
```

If the bucket is reachable but CORS is wrong, uploads fail at the browser with
a network error and the message shows "Tap to retry" — that is the symptom to
look for.

## 4. First admin

There is no UI for granting the first admin. After the account signs up, run
once from the SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<the user id>';
```

`prevent_role_self_escalation()` blocks this from any normal client, which is
why it has to be done with the service role.

## 5. What to test against production, in order

Each of these exercises a path that cannot be proven without the real services.

**Storage round trip.** Send an image in chat. Confirm: a `chat/<conversation>/…`
object appears in the bucket; the bubble renders; the object is *not* reachable
without a signature; deleting the message removes the object.

**Video and poster.** Send a video. Confirm two objects appear (`…​.bin` and
`…-poster.jpg`), the bubble is circular and shows the poster before playback,
and tapping plays it. Delete it and confirm **both** objects go.

**Voice.** Record and send on iOS Safari and on Android Chrome — these produce
different container formats (`audio/mp4` vs `audio/webm;codecs=opus`) and are
the two cases worth exercising by hand.

**Two real accounts.** With a student and an admin signed in on separate
devices: text both directions, read receipts, typing, presence, and killing the
network mid-send to see the failed state and the retry.

**The 100 MB rule.** Fill one conversation to roughly 92 MB of media, then send
a ~20 MB video. Expected: the oldest attachments are deleted from the bucket
first, the student is told cleanup happened, the new upload succeeds, and
`select media_bytes_used from conversations` stays at or under 104857600. Check
that the purged messages still exist as rows, and that no text message was
touched.

**Orphan check.** List the bucket and compare against
`select storage_key from messages where storage_key is not null` plus the same
for `poster_key` and for `posts`. Anything in the bucket that no row references
is an orphan; there should be none. Run it again after a deliberately
interrupted upload — the stale sweep clears those after an hour.

**Retention.** Backdate a test Official post past six months, then
`POST /api/posts/run-retention` with an admin token. The post, its comments and
its R2 objects should all be gone; a recent post must be untouched. Do not
change the window.

**Cross-account isolation.** Signed in as student A, request
`/api/chat/media-url?key=chat/<student B's conversation>/<anything>` and confirm
403. The local suite proves the database refuses this; production confirms the
signing service does too.

## 6. Deployment

`npm run build` then `npm start`. The start script sets `NODE_ENV=production`;
without it the server falls back to the Vite dev middleware and serves an
unbuilt, development React bundle.
