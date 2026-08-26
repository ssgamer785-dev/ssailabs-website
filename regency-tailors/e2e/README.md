# Regency Tailors — end-to-end tests

Browser tests that drive the real showroom suite in Chromium and assert on what
actually lands in the browser database and on printed paper.

## Running

```bash
npm run dev          # in one terminal (serves on :3000)
npm run test:e2e     # in another
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
