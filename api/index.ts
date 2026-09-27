/**
 * Vercel serverless entrypoint for every /api/* route.
 *
 * No port binding, no static-file serving — Vercel's own static hosting
 * serves dist/ directly (see vercel.json's rewrites), and this function
 * only ever receives requests already routed to /api/*. The Express app
 * itself is unchanged from server/app.ts, which server.ts (the local
 * long-lived server) also uses — one set of route definitions, two entry
 * points.
 */
import app from "../server/app.js";

export default app;
