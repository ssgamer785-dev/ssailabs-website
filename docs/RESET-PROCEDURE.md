# Fresh-data reset — procedure

**Nothing here has been run.** This document and `scripts/reset-app-data.mjs`
are the procedure only. The script's default mode deletes nothing.

## What a reset removes, and what survives

| Removed | Kept |
| --- | --- |
| Every auth user except the admin | The admin auth user and profile row |
| Every profile except the admin's | Every table, column, index and constraint |
| All posts, comments, likes, bookmarks | Every RLS policy, function and trigger |
| All conversations and messages | The activation gate itself |
| All notifications | Everything in R2 (see step 5) |
| All membership requests | |
| All activation codes | |

No `DROP`. No `TRUNCATE`. No `supabase db reset`. No schema change of any kind.
Every removal is a `DELETE` with a `WHERE` clause, or a `deleteUser` call
against one specific id.

## Before you start

Take a Supabase backup. The script does not take one and there is no undo.

Confirm your `.env` points at the production project. The script checks this
itself and refuses to continue against any ref other than
`waosqasgxzstbdxohbfe`, but knowing before you start is better than being
stopped.

## Step 1 — see the plan (safe, changes nothing)

```
cd <repo root>
node scripts/reset-app-data.mjs
```

This connects read-only and prints:

- the project host and ref, with the ref check result
- the admin account it will preserve, by masked email and uuid
- a row count for every table it would touch
- the number of R2 objects that would be orphaned
- the member accounts it would remove, by masked email and last sign-in

Then it exits without writing anything. Run it as often as you like.

**Read the numbers.** If the admin line is not the account you expect, or the
counts do not match what you believe is in the database, stop and find out why.

## Step 2 — execute

```
node scripts/reset-app-data.mjs --execute
```

It prints the same plan again, then asks for two things at the keyboard:

1. the exact phrase `DELETE ALL MEMBER DATA`
2. the project ref `waosqasgxzstbdxohbfe`

Either one mismatched aborts with nothing changed. Both correct and it deletes.

## Step 3 — the checks it makes for you

The script stops, before writing anything, if:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset or empty
- the URL's project ref is not `waosqasgxzstbdxohbfe`
- no profile has `role='admin'` — it will not reset a database with no admin to
  preserve, because that would leave nobody able to issue activation codes
- more than one profile has `role='admin'` — it will not guess which to keep

## Step 4 — verify

```
node scripts/reset-app-data.mjs
```

Plan mode again. Every count should now read 0, and the admin line should be
unchanged.

## Step 5 — R2

The script does **not** delete bucket objects. Bucket credentials belong to the
server, not to this script, and an orphaned object costs storage but risks
nothing — whereas a delete against the wrong prefix is unrecoverable.

It reads every `storage_key` and `poster_key` *before* deleting the rows that
hold them, and writes them to `scripts/orphaned-r2-keys.txt` (gitignored).
Remove those objects deliberately with the bucket tooling once you are happy
the database reset went as intended.

## Step 6 — after the reset

The app is empty but fully functional. To let the first member back in:

1. sign in as admin
2. Sidebar → **Activation Codes** → **CREATE ACTIVATION CODE**
3. send the code to the member; it works once and expires after 15 minutes
