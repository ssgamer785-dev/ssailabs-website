# RC6 release runbook — poll pictures and vote counts, Delete member, swipe to reply

Everything here is run by a person with access to the Supabase Dashboard and
Vercel. Nothing in this folder is run automatically.

| | |
|---|---|
| App commit | `081d641` on `release/rc5` (this runbook was added in the commit after it; the app code is identical) |
| Migration | `supabase/migrations/20261115090000_rc6_poll_image_member_deletion_chat_replies.sql` |
| Rollback | `supabase/rollbacks/20261115090000_rc6_poll_image_member_deletion_chat_replies.rollback.sql` |
| Current Production (rollback target) | the `the-traders-planet` deployment of `b178c89` |

## Files

| File | Writes? | What it is |
|---|---|---|
| `preflight.sql` | no | Checks Production is in the expected state; prints schema fingerprints and row counts. |
| `apply.sql` | **yes** | The migration, byte for byte, in one transaction with a 5 s lock timeout. |
| `verify.sql` | no | Checks every new object, permission and security setting; prints the same fingerprints and counts. |
| `../../rollbacks/…rc6….rollback.sql` | yes | Removes the RC6 functions and triggers; keeps every row. |
| `SHA256SUMS` | — | Checksums of all of the above. |

The read-only scripts print no names, e-mails, phone numbers or ids.

## What the migration does

It is additive only:
- It changes no existing row.
- It replaces no existing function, policy or trigger, and drops nothing.
- It adds the following.

| Feature | Added |
|---|---|
| Poll pictures | Function `create_poll_post_with_image`. It calls the existing `create_poll_post` and attaches one picture through the existing upload guard. JPEG, PNG and WebP only. |
| Deleting a member | Columns `profiles.deleted_at` and `profiles.deleted_by`.<br>A trigger that keeps a deleted member deleted.<br>Table `admin_audit_events` (RLS: admins can read it, the server writes it).<br>Function `admin_delete_member`, which only the server may call. |
| Chat replies | Column `messages.reply_to_id`, its index, and a trigger that only allows quoting a message in the same conversation. |

Deleting a member never removes their profile, posts, comments, likes, poll votes or chat. Deleting them would cascade and take other members' comments, the poll results and the admin's chat history with it. Instead:
- The account is anonymised to "Deleted member" and locked.
- Their own private rows are removed: devices (push subscriptions), notifications, notification settings and bookmarks.
- The server closes their sign-in with Supabase Auth's soft delete. This revokes their sessions and removes the e-mail and password, with no cascade.
- An audit event with counts only is written.

## Already proven locally

The rehearsal used real Postgres 16, a fresh database, the full migration chain up to `20261007090000`, and seeded data:

- The preflight is clean and its output holds no personal data.
- Applying while a table is busy gives up after 5 s with `lock timeout`, and nothing changes.
- Apply, then verify: all 12 checks OK. All 6 fingerprints and all 17 row counts are identical before and after.
- Re-running `apply.sql` is harmless.
- Rollback restores the pre-RC6 fingerprints and removes no row. Re-applying after it works.
- The features were used for real afterwards: a poll with a picture, a reply, and a member deleted. A rollback after that keeps the deleted member locked, and keeps their data and the audit row.

You can re-run the rehearsal at any time against a throwaway local server, never Production:
`supabase/releases/rc6/rehearsal/rehearse.sh [PGHOST] [PGPORT]`.

## Steps

### 0. Confirm a restorable backup — before anything else

1. Open Supabase Dashboard, then the Traders Planet project, then **Database**, then **Backups**.
2. Write down the time of the newest backup, or confirm that Point-in-Time Recovery is on.
3. Go ahead only if one of these is true:
   - a backup from the last 24 hours is listed;
   - PITR is on.
4. If the Backups page offers neither, which is the case on the Free plan, take a dump before going further. Use `supabase db dump` with the project's database connection string, once for the schema and once with `--data-only`, and keep both files.

RC6 changes no existing row, so it should never need a restore. The backup is the safety net, not part of the plan.

### 1. Preflight (read-only)

1. Open the Dashboard's **SQL Editor** with the role selector left on `postgres`.
2. Paste `preflight.sql` and run it.
3. Download the result as CSV and keep it.
4. Read the result:
   - Any **STOP** row: do not continue. Send the output for review.
   - A **CHECK** row on `exactly_one_admin`: look at it before continuing.
   - A **CHECK** row on `long_running_transactions`: wait a few minutes and run the preflight again.

### 2. Apply

1. Make sure the editor role is `postgres`.
2. Paste the whole of `apply.sql` and run it. The expected result is "Success. No rows returned".
3. If it reports `lock timeout`, nothing changed. Wait a minute and run it again.

### 3. Verify (read-only)

1. Paste `verify.sql`, run it, and keep the CSV.
2. Pass means all three of the following:
   - every check row says **OK**;
   - every `fp_*` value is **identical** to the preflight's;
   - no `count_*` value is lower than in the preflight.
   
   A count may be higher, because members keep using the app.
3. If any of that fails, run the rollback file, do not promote, and send both CSVs for review.

The migration itself tells the API to reload. If the new Preview still shows no Reply action after a minute, run `notify pgrst, 'reload schema';` once.

### 4. Test the Preview

1. Check the Supabase project the Preview uses. In Vercel, open `the-traders-planet`, then **Settings**, then **Environment Variables**, then **Preview**. `VITE_SUPABASE_URL` and `SUPABASE_URL` show which project the Preview talks to.
2. If it is the Production project, every test below touches real data. Use only a **disposable test Student** that you create for this, and real members' content only for reading.
3. Open the Preview deployment of the latest `release/rc5` commit while signed in to Vercel.

| Area | Test |
|---|---|
| Polls | Counts show "N votes" and "N participants", with no percentages. Vote and change your vote with the test Student only. |
| Polls | As Admin, create a poll with a picture: Add, Replace, Remove, Publish. The picture shows above the options on a phone and on desktop. A GIF is refused.<br>Delete this test poll afterwards. |
| Chat | Admin and test Student: swipe a message right on a phone and send the reply. The quote shows; tapping it scrolls to the original; the reply survives a reload.<br>On desktop, hover a message and click Reply. Escape cancels. |
| Chat | Reply to a photo, a voice note, a PDF and an album. Delete the original and confirm the quote says "This message was deleted" or "Original message unavailable". |
| Delete member | As Admin, open the inbox, then **⋯** on the **test Student**, then Delete member. Check the warning, then type DELETE.<br>The member disappears and the count drops.<br>The test Student's open session is thrown out within the hour and their next sign-in fails.<br>Their posts show "Deleted member".<br>Deleting yourself is not offered. |
| Regressions | Sign-in for both roles, both dashboards, Official and Students communities, posting with media, comments, calculator, chat uploads, notifications, installed PWA, phone and desktop widths. |

### 5. Promote

1. In Vercel, open `the-traders-planet`, then **Deployments**.
2. Open the tested Preview, then use **⋯**, then **Promote to Production**.
3. Wait until it shows **Ready** and **Current**.

### 6. Production smoke

Do not delete real members and do not change real votes. Use the test Student and test content only.

1. `https://www.thetradersplanet.in` loads the new build.
2. `https://thetradersplanet.in` redirects to www.
3. Poll counts read "N votes" with no percentages.
4. Reply works in a chat with the test Student.
5. A chat message from the test Student reaches the Admin's device as a push. This proves push still works; the VAPID keys and subscriptions are untouched.
6. Delete the test Student, if it was not already deleted in step 4.

### Rollback

- **App:** in Vercel, open Deployments, then the `b178c89` Production deployment, then **Promote to Production** (Instant Rollback).
  - The RC6 database objects can stay. The old app ignores them: it reads chats by explicit column list, and only updates single profile fields.
  - Poll pictures already published stay stored. The old app does not show them on a poll.
- **Database:** only if needed, run the rollback file in the SQL Editor as `postgres`.
  - It removes the RC6 functions and triggers.
  - It keeps every row, every reply link and the audit log.
  - If any member was deleted, it keeps the trigger that stops that member being restored.
  - Its optional block, which drops the columns and the audit log, is commented out and is destructive. Do not run it without a separate decision.
