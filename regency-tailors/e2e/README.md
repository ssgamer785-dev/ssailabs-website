# Regency Tailor — end-to-end tests

Browser tests that drive the real showroom suite in Chromium and assert on what
actually lands in the browser database and on printed paper.

## Running

```bash
npm run dev:local    # in one terminal — browser-storage mode on :3000
npm run test:e2e     # in another
```

The workflow suite runs against `dev:local` on purpose: it exercises the
business logic without needing a Supabase project. Authorisation itself is
tested where it is actually enforced — `npm run test:db`.

To check the sign-in gate, run a dev server in Supabase mode and point the gate
suite at it:

Bill suite:

```bash
npm run test:bill
```

```bash
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_ANON_KEY=not-a-real-key npx vite --port=3001
E2E_BASE_URL=http://localhost:3001 node e2e/auth-gate.mjs
```

The two consistency suites need a dev server in **Supabase mode**, pointed at
a host only the in-page PostgREST shim answers, and they can be pointed at a
production build instead of the dev server:

```bash
VITE_SUPABASE_URL=https://fake-project.supabase.co \
VITE_SUPABASE_ANON_KEY=sb_publishable_TESTKEY_0000000000000000 npx vite --port=3100
npm run test:consistency
npm run test:integrity
npm run test:order-edit

# or against the built bundle
npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4180
E2E_BASE_URL=http://localhost:4180/ npm run test:consistency
```

Set `CHROME_PATH` if Playwright's bundled Chromium is not where the harness
expects it:

```bash
CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

## What is covered

| Scenario | What it proves |
| --- | --- |
| Full order workflow | Customer → order → garments → measurements → remarks → save, with per-garment measurement isolation |
| Order numbering | Sequential issue; a number retired by delete + empty-trash is never re-issued |
| Concurrent tabs | Two tabs cannot issue the same number or erase each other's orders |
| Editing an order | Payments, status, production notes and invoice state survive an edit |
| Duplicate customers | A returning client's phone number resolves to the existing ledger row |
| Production slip print | A slip the app labels "N pages" prints as exactly N A4 sheets, with no showroom chrome on the paper |
| Bill print | One A4 sheet, correct customer/order/totals, no navigation on the page |
| Backup round trip | Export → wipe → import restores every record, relationship and the order-number mark |
| Hostile backups | Empty, truncated, non-JSON, foreign-app, oversized and structurally broken files are rejected or repaired without data loss |
| Storage failure | Corrupt localStorage and a full quota degrade to a warning, never a blank screen |
| Customer bill (`order-bill.mjs`) | The blank-amount bill opens from the order flow, carries every garment with its own fabric, remarks and measurements, prints as the number of A4 sheets it reports, renders the real logo, and contains no financial term, value or currency symbol anywhere |
| Auth gate (`auth-gate.mjs`) | An unauthenticated visitor sees the sign-in screen only: no dashboard, no records, no data written to browser storage, deep links do not bypass it |
| Order uuid (`order-uuid.mjs`) | The real wizard places an order against a PostgREST that enforces uuid columns: a provisional `CUST-…` id never reaches `orders.customer_id` |
| Data consistency (`consistency.mjs`) | One journey — new customer, four garments, all 41 measurements, PLACE ORDER — then every screen is compared against the rows the database actually holds: ledger, profile, orders, dossier, measurements, production slip, customer bill, and again after a hard refresh |
| Trash permanent delete (`integrity.mjs`) | The red bin button removes the whole tree the record owns and nothing else: a customer takes their orders, garment lines, payments, fittings, measurements and measurement values with them; an order takes its own children but never its customer; a refused purge deletes nothing and says so; and none of it comes back on a refresh |
| Order edit / number immutability (`order-edit-number.mjs`) | In Supabase mode, against the real repository: the first order is #1; editing it three times leaves it #1, one row, the same uuid, three UPDATEs and no second INSERT; it survives a reload as #1; the next new order is #2, not #4; editing #1 again leaves #1 and #2 alone; the one after that is #3; the client never sends an order number; and an UPDATE that tries to change `order_number` is refused by the database |
| Data integrity (`integrity.mjs`) | The edges: a customer edit reaching every screen, an open dossier showing the status the database now holds, a refused write never reported as saved, a returning phone number not opening a second ledger row, a refused order never announced as placed, delete → trash → restore returning the same logical row, rapid and double clicks not duplicating an order, the client portal's blanks and zeroes, the backup file's contents, and sign out → sign in |

## The database suites

`npm run test:db` boots a throwaway PostgreSQL cluster, applies the auth stub
and every migration in order, and runs `supabase/tests/1*_test_*.sql`. It needs
the PostgreSQL server binaries (`PGBIN=/usr/lib/postgresql/16/bin`).

| File | What it proves |
| --- | --- |
| `10_test_rls.sql` | One predicate guards every table; anon and an unauthorised account get nothing |
| `11_test_integrity.sql` | Constraints, generated columns, sequences and triggers behave as the app assumes |
| `12_test_backup_restore.sql` | Export/restore, hostile payloads, settings handling, audit log never restored |
| `13_test_purge_trash.sql` | Permanent deletion: the whole owned tree, nothing else, all-or-nothing, admin only, and absent from a later export |
| `14_test_backup_roundtrip.sql` | A full tree out and back with its uuids, relationships, soft-delete state, measurements, payments and sequence intact — and untouched when a payload is bad |

## The PostgREST shim

`fake-postgrest.js` is installed before the app boots and answers the Supabase
host in-page. It is not a stub: it enforces the uuid columns, the foreign keys,
`customers_phone_unique_live`, `measurements.customer_id`'s unique constraint
and `order_items (order_id, position)`, it refuses an UPDATE that changes
`orders.order_number` the way `orders_number_is_immutable` does, and it serves
`customers_with_stats`
and the `trash_items` view the way the migrations define them, and it answers
`rpc/purge_trash_entry` the way the migration does — so the app's real
repository code meets the same errors it would meet in production. Set
`window.__PGREST_PERSIST` before it loads and the tables survive a reload,
which is what makes the refresh and sign-out tests mean anything.
