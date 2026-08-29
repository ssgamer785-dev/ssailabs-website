# Regency Tailor — Showroom & Tailoring Suite

Bespoke tailoring management system for the Regency Tailor showroom: customers,
orders, garments, measurements, production slips, bills, backup and recovery.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 (Supabase mode; sign-in required) |
| `npm run dev:local` | Dev server in browser-storage mode, no sign-in — development only |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Unit tests for the business logic (Vitest) |
| `npm run test:e2e` | Browser end-to-end suite — needs `npm run dev:local` running |
| `npm run test:bill` | Customer-bill suite — needs `npm run dev:local` running |
| `npm run test:db` | Schema, RLS and restore tests against a throwaway PostgreSQL |

## Where the data lives

**PostgreSQL on Supabase is the authoritative database.** Signing in from any
device loads the same showroom. Setup is in **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)**.

- **Sign-in is required.** Google account, and only accounts on the showroom's
  allowlist (`staff_profiles`) receive any data. Row Level Security enforces
  this in the database, not just in the interface.
- **One role: Admin.** Every authorised account has full access to the whole
  application. There is no second permission tier.
- Browser storage is used only when `VITE_PERSISTENCE=local` is set explicitly,
  for development and the end-to-end suite. It is never a silent fallback for a
  misconfigured production build, because that would mean an unauthenticated
  local copy of client data.
- Regular **Backup & Recovery → Export Backup** is still worth the habit.

## Order numbers

Issued by a PostgreSQL sequence with a unique constraint: collision-safe across
devices and concurrent sessions by construction. A number is never re-issued —
not after the order is deleted, not after the trash is emptied, not from a
second device. Backups carry the sequence position, so a restored database
continues from the correct next number.

On the browser-storage development path the same guarantee is provided by a
monotonic high-water mark in `src/utils/orderNumbering.ts`.

## Documents

Three separate documents, deliberately kept apart:

| Document | Audience | Money shown |
| --- | --- | --- |
| **Customer Order Bill** | The customer | **None.** Full order, garment and measurement detail; the amount is written on the printed sheet by hand |
| **Production Slip** | The workshop | Not applicable — production detail only |
| **Bill / Receipt** | Admin | Figures, as before |

The Customer Order Bill opens from **Print Bill** on the order confirmation
screen and from the order detail view.

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
