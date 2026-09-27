# The Traders Planet

A trading education and signals community app: official updates, a students
community feed, a risk calculator, direct chat with the admin team, market
news, notifications and profiles.

React 19 + Vite on the front end, an Express server for the media endpoints,
Supabase for auth, data and realtime, and a private Cloudflare R2 bucket for
chat and post attachments.

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:

   ```
   npm install
   ```

2. Create a `.env` in the project root. `.env.example` lists every variable and
   which ones are server-only — never give a server-only key a `VITE_` prefix,
   or it ends up in the browser bundle.

3. Build and start:

   ```
   npm run build
   npm start
   ```

   Then open http://localhost:3000.

   Use `npm start`, not `npm run dev`, for anything you intend to look at as
   production: `start` sets `NODE_ENV=production` and serves the built bundle,
   while without it the server falls back to the Vite dev middleware.

## Checks

```
npm run lint     # tsc --noEmit
npm test         # bun test
```

The database behaviour has its own suites, which apply the full migration chain
to a throwaway Postgres and assert against it:

```
supabase/tests/run.sh [PGHOST] [PGPORT]
```

## Where things live

| Path | What |
| --- | --- |
| `src/` | The React app: screens, components, and the hooks that talk to Supabase |
| `server.ts`, `server/` | Express server, R2 signing, media quota enforcement |
| `supabase/migrations/` | The schema, RLS policies and maintenance functions |
| `supabase/tests/` | SQL behaviour suites |
| `supabase/README.md` | How the backend fits together |
