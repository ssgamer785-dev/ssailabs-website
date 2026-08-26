# Regency Tailors — Showroom & Tailoring Suite

Bespoke tailoring management system for the Regency Tailors showroom: customers,
orders, garments, measurements, production slips, bills, backup and recovery.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Unit tests for the business logic (Vitest) |
| `npm run test:e2e` | Browser end-to-end suite — needs `npm run dev` running |

## Where the data lives

**All showroom data is stored in the browser's `localStorage`**, under keys
prefixed `REGENCY_TAILORS_DB_V3_`. There is no server and no remote database.
That has consequences the showroom should know about:

- Data belongs to **one browser profile on one machine**. Clearing site data,
  switching browser, or using a different computer means starting empty.
- Browsers cap this storage at roughly 5–10 MB. The suite now warns on screen the
  moment a save is refused, but the safe habit is a regular
  **Backup & Recovery → Export Backup**, kept off the machine.
- `supabase/migrations/20260825_security_and_rls.sql` describes a Postgres schema
  with RLS policies, but **no part of the application talks to Supabase** —
  `src/lib/supabase.ts` is not imported anywhere. Treat that migration as a
  design document for a future server, not as the live database.
- There is **no authentication**. Anyone who can open the browser can see and
  change every record. The Admin / Receptionist switch in the sidebar is a label
  only; it does not restrict anything. Keep the showroom machine locked.

## Order numbers

Order numbers are issued from a monotonic high-water mark stored alongside the
data (`..._ORDER_SEQ`) and reserved at the moment the order is placed. A number
is never re-issued — not after the order is deleted, not after the trash is
emptied, and not by a second browser tab. Backups carry the mark, so a restored
database continues from the correct next number.

## Printing

Production slips and bills print through the browser's own print dialog against
a dedicated print stylesheet in `src/index.css`. The slip paginates itself
across A4 sheets using measured millimetre budgets in
`src/utils/productionSlipPagination.ts` — if the modal says "5 pages", the
printer produces five sheets. Choose **A4**, **Portrait**, and enable
**Background graphics** in the print dialog.

## Known issue: the bundled logo asset is corrupt

`public/regency-tailors-logo.jpg` and `src/assets/images/regency-tailors-logo.jpg`
are **not valid JPEG files**. Both begin with UTF-8 replacement characters
(`EF BF BD`) where the JPEG marker `FF D8 FF E0` should be, and contain ~207,000
such sequences — the file was damaged by a text-encoding round trip somewhere
before it reached this repository, and the original pixel data cannot be
recovered from it.

Every screen that shows the logo therefore falls back to the engraved **RT**
monogram (the sidebar already did this; the customer bill now does too, instead
of showing a broken-image icon).

**To restore the real logo:** drop the original artwork in at both paths, keeping
the filenames. Verify it first — `file public/regency-tailors-logo.jpg` should
report `JPEG image data`, not `data`. A smaller file is also worth having: the
current placeholder is 895 KB and is fetched on every screen that shows a logo.
