# Regency Tailors — end-to-end tests

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

```bash
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_ANON_KEY=not-a-real-key npx vite --port=3001
E2E_BASE_URL=http://localhost:3001 node e2e/auth-gate.mjs
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
| Auth gate (`auth-gate.mjs`) | An unauthenticated visitor sees the sign-in screen only: no dashboard, no records, no data written to browser storage, deep links do not bypass it |
