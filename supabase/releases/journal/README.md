# Trading Journal release runbook

A person with access to the Supabase Dashboard and Vercel runs everything here. Nothing in this folder runs automatically.

| | |
|---|---|
| App commit | the `release/rc5` commit that adds this folder (its message starts "Trading Journal") |
| Migration | `supabase/migrations/20261116090000_trading_journal.sql` |
| Rollback | `supabase/rollbacks/20261116090000_trading_journal.rollback.sql` |
| Current Production (rollback target) | the `the-traders-planet` deployment of `ddd06af` (RC6 + mobile hotfix) |
| Base it is written against | RC6 applied (`preflight.sql` checks this). Do **not** re-run the RC5 or RC6 SQL. |

## Order matters

The new app reads a table that only exists after this migration. If the app is promoted first, the Journal tab shows "The Trading Journal needs a database update" and nothing else breaks. Still, apply the SQL first, test the Preview, and only then promote.

The old app ignores the new table. That makes rolling the app back safe at any point.

## Files

| File | Writes? | What it is |
|---|---|---|
| `preflight.sql` | no | Checks Production is the expected RC6 base; prints schema fingerprints and row counts. |
| `apply.sql` | **yes** | The migration, byte for byte, in one transaction with a 5 s lock timeout. |
| `verify.sql` | no | Checks the new table, rules, privacy and permissions; prints the same fingerprints and counts. |
| `../../rollbacks/…trading_journal.rollback.sql` | yes | Switches the journal off at the database (drops `journal_summary()`); keeps every trade. |
| `rehearsal/` | local only | Replays all of this on a throwaway local Postgres. |
| `SHA256SUMS` | — | Checksums of the SQL above. |

The read-only scripts print no names, e-mails, phone numbers or ids.

## What the migration does

It is additive only. It changes no existing row, function, policy, trigger, column, grant or index, and it drops nothing.

| Added | Purpose |
|---|---|
| Table `journal_trades` | One row per trade: date, symbol, buy/sell, R:R, result, P&L amount and currency, strategy, mistakes, notes and an optional screenshot reference. 17 data rules are enforced in the database, for example: a profit is positive, a loss negative and a breakeven zero; a screenshot key must sit in its owner's own `journal/<user id>/` folder. |
| 4 RLS policies | Each member can read, add, edit and delete **only their own** trades. Adding and editing also needs an activated account. The Admin cannot read members' journals, and signed-out visitors get nothing. |
| Trigger `journal_trades_guard` | A trade can never be moved to another member; its creation time is kept and edits are time-stamped. |
| Function `journal_summary()` | The Journal's figures for the signed-in member only. It runs as that member, so RLS applies. |
| 2 indexes | Fast "my trades, newest first"; one screenshot belongs to one trade. |

Each trade belongs to its owner's profile; if a profile is ever removed outright, its trades go with it. When the Admin deletes a member from the app (RC6 Delete member), the server now also removes that member's journal: screenshots first, then trades.

**Screenshots.**
- Stored in the existing private R2 bucket under `journal/<user id>/`.
- Uploads go straight to R2 through a 5-minute upload link that the server issues to the signed-in owner only. The link is locked to that file type and size: JPEG, PNG or WebP, up to 10 MB.
- Viewing uses a short-lived signed link, issued only to the trade's owner.
- No public or unsigned link is ever used.
- Nothing changes in R2's configuration. The existing CORS rules that already allow the app's uploads cover this too.

## Already proven locally

The rehearsal ran on real Postgres 16 with a fresh database and the full migration chain up to RC6. It was seeded with an admin, 3 students (one of them deleted through RC6), polls, votes, and a chat with a reply.

| Step | Result |
|---|---|
| Preflight | No STOP row, and no personal data in the output. |
| Apply while `profiles` is being written | Gives up after 5 s with `lock timeout`. Nothing changed. |
| Apply, then verify | All 9 checks OK. All 6 schema fingerprints and all 19 row counts are identical before and after. |
| Re-run `apply.sql` | Harmless: verify is identical. A preflight on the migrated database shows no STOP. |
| Rollback | Restores every pre-existing object exactly and removes no row. Re-applying after it works. |
| Real use through RLS | Student one logged 3 trades; student two saw 0 of them. |
| Rollback after real use | Keeps all 3 trades, still owner-only. Re-applying brings the figures back. |

The automated SQL suite (`supabase/tests/84-trading-journal.sql`, 49 checks) also covers:
- every data rule;
- another member, a not-yet-activated member, the Admin and signed-out visitors, each failing to read, change or delete someone's trades;
- the server itself failing to move a trade between members;
- exact figures across many trades.

Re-run the rehearsal at any time, against a throwaway local server only (never Production):
`supabase/releases/journal/rehearsal/rehearse.sh [PGHOST] [PGPORT]`

## Steps

### 0. Confirm a restorable backup — before anything else

1. Open Supabase Dashboard, then the Traders Planet project (`waosqasgxzstbdxohbfe`), then **Database**, then **Backups**.
2. Write down the time of the newest backup, or confirm that Point-in-Time Recovery is on.
3. Go ahead only if one of these is true:
   - a backup from the last 24 hours is listed;
   - PITR is on.
4. If neither is offered (the Free plan), take a dump first. Use `supabase db dump` with the project's connection string, once for the schema and once with `--data-only`, and keep both files.

The migration changes no existing row, so it should never need a restore.

### 1. Preflight (read-only)

1. Check the project name and ref at the top of the Dashboard. It must be **The Traders Planet / `waosqasgxzstbdxohbfe`**, not any other project.
2. Open **SQL Editor** with the role selector left on `postgres`.
3. Paste `preflight.sql` and run it. Download the result as CSV and keep it.
4. Read the result:
   - Any **STOP** row: do not continue. Send the output for review.
     - `previous_release_applied` STOP means RC6 is not in place.
     - `journal_table` STOP means a different table of that name already exists.
   - **CHECK** on `long_running_transactions`: wait a few minutes and run it again.
   - **INFO** on `journal_table` or `journal_functions`: the migration already ran. Re-running it is safe.

### 2. Apply

1. Make sure the editor role is `postgres`.
2. Paste the whole of `apply.sql` and run it. The expected result is "Success. No rows returned".
3. If it says `lock timeout`, nothing changed. Wait a minute and run it again.

### 3. Verify (read-only)

1. Paste `verify.sql`, run it, and keep the CSV.
2. Pass means all three of the following:
   - every check row says **OK**;
   - every `fp_*` value is **identical** to the preflight's;
   - no `count_*` value is lower than in the preflight. It may be higher, because members keep using the app.
3. `no_trades_yet` says CHECK only if someone has already logged a trade. Right after applying, it is OK.
4. If anything fails: do not promote, and send both CSVs for review. Run the rollback only if asked to.

The migration tells the API to reload. If the Preview still says "needs a database update" a minute later, run `notify pgrst, 'reload schema';` once.

### 4. Test the Preview

1. Check which Supabase project the Preview uses: Vercel → `the-traders-planet` → **Settings** → **Environment Variables** → **Preview** (`VITE_SUPABASE_URL` and `SUPABASE_URL`).
2. If it is the Production project, every test below writes real data. Use **two disposable test Students** created for this. Never log trades on a real member's account.
3. Open the Preview deployment of the exact `release/rc5` commit while signed in to Vercel.

| Area | Test |
|---|---|
| Navigation | The bottom bar shows **Journal** (book icon) where Calendar was. The Economic Calendar still opens from the side menu (☰) and from Home's quick action. |
| Empty state | A fresh test Student sees "No trades added yet" and **Add Your First Trade**. No sample trades or figures. |
| Add | Fill every field: date, symbol (pick one and type a custom one), Buy/Sell, R:R (a preset and a custom 1:2.5), Profit with amount, a strategy, mistakes and notes, and a screenshot.<br>Replace the screenshot, then remove it, then add it again. A GIF or PDF is refused. On an iPhone, scroll the whole form with the keyboard open.<br>**Save Trade** returns to the Journal and the trade is at the top. |
| Results | Add a Loss, then a Breakeven. The amount sign follows the result: a loss shows negative and a breakeven 0. Add one trade in another currency: Net P&L does not mix currencies, and the line below lists each one. |
| Details | Tap a trade. Every field shows, and the screenshot opens full screen. **Edit Trade**: change something and save; it is the same trade, updated, with an "Edited" time. **Delete Trade**: confirm, and it is gone along with its screenshot. |
| Filters | All, Profit, Loss. The date range starts on This Month; Last Month, Last 3 Months, This Year and All Time reach older trades. **Show older trades** appears when a range holds more than 30. |
| Analytics | Best Strategy needs at least 3 trades of one strategy. Discipline Score shows "Not enough data" until 5 trades have the plan question answered. |
| Privacy | Signed in as the second test Student, none of the first one's trades, figures or screenshots appear. Copying a trade link from the first Student and opening it as the second shows "This trade is no longer available". |
| Failure | Turn on airplane mode, then tap Save. An error shows and every field, screenshot included, is kept. Turn the network back on and Save once: one trade is saved. |
| Regressions | Sign-in for both roles, both dashboards, communities, posting with media, polls, comments, chat (including swipe-to-reply), calculator, Economic Calendar, notifications, installed PWA, phone and desktop widths. |

Afterwards, delete the test trades through **Delete Trade**, or delete the test Students as Admin; that also removes their journals.

### 5. Approve and promote

1. In Vercel, open `the-traders-planet`, then **Deployments**. Change no other project.
2. Open the tested Preview, then **⋯**, then **Promote to Production**.
3. Wait until it shows **Ready** and **Current**.

### 6. Production smoke

1. `https://www.thetradersplanet.in` loads the new build, and the bottom bar shows Journal.
2. `https://thetradersplanet.in` redirects to www.
3. With a test Student: add a trade with a screenshot, open it, then delete it.
4. The Economic Calendar opens from the side menu.
5. Push still works: a chat message from the test Student reaches the Admin's device. The VAPID keys and subscriptions are untouched.

### R2 check (look only — change nothing)

In Cloudflare, open R2, then the app's bucket, then **Settings**. Under Public access, note whether an `r2.dev` subdomain or a custom domain is connected.

The app never uses either for the journal; it only hands out signed links. If either is on, an object would be reachable by anyone who already knows its full key. Keys hold a random UUID and are only given to the trade's owner.

Report what you see. Do not change it as part of this release.

### Rollback

- **App:** in Vercel, open Deployments, then the `ddd06af` Production deployment, then **Promote to Production** (Instant Rollback).
  - The journal table can stay. The old app never reads it.
  - Trades and screenshots already logged stay stored and private.
- **Database:** only if needed, run the rollback file in the SQL Editor as `postgres`.
  - It drops `journal_summary()` only. Every trade stays, readable only by its owner.
  - Re-applying `apply.sql` later brings the figures back.
  - Its commented-out second block deletes every logged trade. It is destructive: do not run it without a separate, explicit decision.
  - If that block is ever run, also remove the R2 objects under `journal/`.
