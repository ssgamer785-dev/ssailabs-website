/**
 * The Express API surface, with no port binding and no static-file serving.
 *
 * Split out of server.ts so the exact same route definitions can be reused
 * as a Vercel serverless function (api/index.ts) as well as by the local
 * long-lived server. Vercel serves dist/ itself via its own static hosting
 * + rewrites (see vercel.json), so this app never needs to know about that.
 */
import express from "express";
import dotenv from "dotenv";
import { chatMediaRouter } from "./chat-media.js";
import { postMediaRouter } from "./post-media.js";
import { adminAuthRouter } from "./admin-auth.js";
import { profileMediaRouter } from "./profile-media.js";
import { fxRouter } from "./fx.js";
import { pushRouter } from "./push.js";
import { notificationsRouter } from "./notifications.js";

dotenv.config();

const app = express();

app.use(express.json());

// Cloudflare R2-backed chat attachments (signed upload/read URLs, quota purge).
app.use("/api/chat", chatMediaRouter());
// R2-backed community post attachments + the 6-month retention sweep.
app.use("/api/posts", postMediaRouter());
// The single admin's username/password sign-in. Credentials stay server-side.
app.use("/api/admin", adminAuthRouter());
// R2-backed profile pictures. Writes are keyed to the caller's own id.
app.use("/api/profile", profileMediaRouter());
// Cached USD-based FX rates for the Risk Calculator. No auth: public rate data.
app.use("/api/fx", fxRouter());
app.use("/api/push", pushRouter());
// Authenticated, per-owner notification deletion; does not touch content rows.
app.use("/api/notifications", notificationsRouter());

// The S.S AI LABS contact-form routes (/api/start-project, /api/leads) were
// removed: this app never called them, /api/leads served every submitted
// name, email and phone number to anyone without authentication, and
// /api/start-project let any caller send HTML email through the SMTP account.

export default app;
