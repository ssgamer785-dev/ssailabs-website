/**
 * Shared Cloudflare R2 + Supabase plumbing for the media routers.
 *
 * R2 credentials and the service-role key exist only in this process. Both
 * routers authorize every request against the caller's Supabase JWT before
 * signing anything.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { displayVariantKey, mayHaveVariant } from './media-variants.js';

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

let s3: S3Client | null = null;
let admin: SupabaseClient | null = null;

/**
 * A presigned PUT that binds the object's Content-Type as well as its size.
 * The S3 presigner leaves content-type out of the signature by default, so
 * any type could be stored under a validated key (TP-024); `signableHeaders`
 * puts it back in, and the browser must send exactly the type it asked for.
 */
export function signedPutUrl(key: string, mimeType: string, sizeBytes: number, expiresIn: number): Promise<string> {
  return getSignedUrl(
    getS3()!,
    new PutObjectCommand({ Bucket: bucket()!, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn, signableHeaders: new Set(['content-type']) },
  );
}

/**
 * How a signed GET tells the browser to treat an object: the type recorded
 * for it when that type is on the allow-list for its kind, otherwise a plain
 * download. So a file stored under a misleading type (possible before the
 * type was signed) can never be rendered as a page.
 */
export function servedAs(args: { mimeType: string | null | undefined; allowed: boolean; download: boolean; fileName?: string | null }): {
  ResponseContentType: string;
  ResponseContentDisposition: string;
} {
  const type = args.allowed && args.mimeType ? args.mimeType : 'application/octet-stream';
  const asDownload = args.download || !args.allowed;
  const safeName = (args.fileName ?? '').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120).trim();
  const disposition = asDownload
    ? (safeName ? `attachment; filename="${safeName}"` : 'attachment')
    : 'inline';
  return { ResponseContentType: type, ResponseContentDisposition: disposition };
}

export function bucket(): string | undefined {
  return env('R2_BUCKET');
}

/**
 * A signed GET that is the same for everyone who asks within one window: it is
 * signed as of the window's start and lives two windows, so whoever receives
 * it can use it for at least one more window. The same address for the same
 * picture lets the browser's own cache answer a reload, a reopened app or
 * another screen without downloading the picture again. An object never
 * changes under its key, so the answer may be kept while it is fresh:
 * community media for a day; private chat media only while its address lives.
 */
export async function signStableGet(
  key: string,
  served: ReturnType<typeof servedAs>,
  { windowSeconds, keepPrivateCopyShort }: { windowSeconds: number; keepPrivateCopyShort: boolean },
): Promise<{ url: string; expiresIn: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const lifetime = windowSeconds * 2;
  const cacheControl = keepPrivateCopyShort ? `private, max-age=${lifetime}` : 'private, max-age=86400, immutable';
  const url = await getSignedUrl(
    getS3()!,
    new GetObjectCommand({ Bucket: bucket()!, Key: key, ...served, ResponseCacheControl: cacheControl }),
    { expiresIn: lifetime, signingDate: new Date(start) },
  );
  return { url, expiresIn: Math.max(1, Math.floor((start + lifetime * 1000 - now) / 1000)) };
}

/** The most keys one batch of signed GETs may ask for: a screen's worth of pictures, never a whole history. */
export const MAX_BATCH_KEYS = 40;

/**
 * The keys a batch request asks to sign: 1 to MAX_BATCH_KEYS strings, each
 * the length a real key can be, with repeats dropped. Null when the request
 * is not that shape, so the caller answers 400 instead of guessing.
 * Every key is still checked one by one, exactly as the single-key route
 * checks it; this only bounds how much one request can ask for.
 */
export function batchKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_BATCH_KEYS) return null;
  if (!raw.every(key => typeof key === 'string' && key.length >= 1 && key.length <= 1024)) return null;
  return [...new Set(raw as string[])];
}

/** Null when R2 isn't configured — callers then 503 instead of throwing. */
export function getS3(): S3Client | null {
  if (s3) return s3;
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket()) return null;

  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3;
}

/**
 * Drops the cached clients so the next call rebuilds them from the current
 * environment.
 *
 * Only the tests need this. Both clients are module-level singletons built on
 * first use, which is right in a server process — the environment does not
 * change under it — but means a test that points SUPABASE_URL at a local
 * stand-in gets whichever URL happened to be read first instead.
 */
export function resetClientsForTests(): void {
  s3 = null;
  admin = null;
}

/** Service-role client. Bypasses RLS, so only use it after verifying the caller. */
export function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/**
 * Wraps an async route so a rejection cannot take the process down.
 *
 * Express 4 does not await a handler, so a rejected promise never reaches its
 * error middleware — it surfaces as an unhandled rejection, and Node exits on
 * those. A single failed R2 call was therefore enough to kill the server: a
 * DeleteObjects during a quota purge answered 503, the SDK threw, and the
 * process went with it.
 *
 * The failure is not hidden. It is logged in full server-side, and the caller
 * gets a 503 telling them the operation did not happen, so nothing downstream
 * mistakes a failed purge or a failed signature for a successful one.
 */
/**
 * What a failed route tells the caller. Every route used to answer "Media
 * storage is temporarily unavailable", including push, notification and
 * sign-in failures that had nothing to do with storage (TP-037). The routers
 * outside media now pass their own sentence; the logged error is unchanged.
 */
export const MEDIA_UNAVAILABLE = 'Media storage is temporarily unavailable. Please try again.';

export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
  failureMessage: string = MEDIA_UNAVAILABLE,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: unknown) => {
      console.error(`[media] ${req.method} ${req.originalUrl} failed:`, error);
      // Something already started writing: the response is no longer ours to
      // shape, so hand it to Express rather than writing a second set of headers.
      if (res.headersSent) {
        next(error);
        return;
      }
      res.status(503).json({ error: failureMessage });
    });
  };
}

/**
 * Deletes objects from R2, treating a partial failure as a failure.
 *
 * DeleteObjects answers 200 even when individual keys could not be removed —
 * in Quiet mode the response carries only the ones that failed. Sending the
 * command and ignoring the result therefore reports success for objects that
 * are still in the bucket, and the caller goes on to mark those rows purged.
 * Throwing here keeps the two-phase contract intact: the database is only told
 * the space is free once the bytes are actually gone.
 */
export async function deleteObjects(
  client: S3Client,
  bucketName: string,
  keys: { Key: string }[],
): Promise<void> {
  if (!keys.length) return;

  // A picture's display copy goes with it, whichever path removes the picture.
  // (Deleting a copy that was never made is not an error.)
  const all = [...keys, ...keys.filter(k => mayHaveVariant(k.Key)).map(k => ({ Key: displayVariantKey(k.Key) }))];

  // DeleteObjects takes at most 1000 keys.
  for (let i = 0; i < all.length; i += 1000) {
    const chunk = all.slice(i, i + 1000);
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: chunk, Quiet: true },
    }));

    const errors = result.Errors ?? [];
    if (errors.length) {
      const first = errors[0];
      throw new Error(
        `R2 delete failed for ${errors.length} of ${chunk.length} object(s); ` +
        `first: ${first.Key ?? '(unknown key)'} — ${first.Code ?? 'unknown'}: ${first.Message ?? 'no message'}`,
      );
    }
  }
}

export interface Caller {
  userId: string;
  isAdmin: boolean;
  isActivated: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The user id a bearer token claims, NOT verified: only ever used to start
 * reading that profile while Supabase verifies the token, and thrown away
 * unless Supabase confirms the same id.
 */
export function claimedUserId(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const sub = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.sub;
    return typeof sub === 'string' && UUID.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

type ProfileRead = { data: { role?: string | null; activated_at?: string | null } | null; error: { code?: string } | null };

/**
 * Verifies the bearer token with Supabase and resolves the caller's role.
 *
 * Identity comes only from Supabase's verification. The profile row is read at
 * the same time, for the id the token claims, so the two cost one round trip
 * to the database instead of two (each is a trip across the Pacific); that
 * early read is used only when Supabase confirms the same id, and is otherwise
 * read again for the confirmed one.
 */
export async function authenticate(req: Request): Promise<Caller | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const db = getAdmin();
  if (!db) return null;

  const token = header.slice(7);
  const readProfile = (id: string): Promise<ProfileRead> =>
    Promise.resolve(db.from('profiles').select('role, activated_at').eq('id', id).single())
      .then(r => r as ProfileRead, (e: unknown) => ({ data: null, error: { code: (e as { code?: string })?.code ?? 'FETCH' } }));
  const claimed = claimedUserId(token);
  const [{ data, error }, early] = await Promise.all([db.auth.getUser(token), claimed ? readProfile(claimed) : Promise.resolve(null)]);
  // The auth server could not answer (down, or unreachable): that says nothing about the caller's token. It is a
  // temporary failure (503 through asyncRoute), never "not signed in" (401), which would make the app refresh the
  // member's session for nothing — each refresh rotates the refresh token, and one cut off by a phone suspending
  // the app is how a Supabase session gets revoked.
  if (error && isAuthRetryableFetchError(error)) throw error;
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = early && claimed === data.user.id && early.error?.code !== 'FETCH'
    ? early : await readProfile(data.user.id);
  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  return { userId: data.user.id, isAdmin: profile?.role === 'admin', isActivated: profile?.role === 'admin' || !!profile?.activated_at };
}
