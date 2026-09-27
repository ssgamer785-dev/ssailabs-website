/**
 * Shared Cloudflare R2 + Supabase plumbing for the media routers.
 *
 * R2 credentials and the service-role key exist only in this process. Both
 * routers authorize every request against the caller's Supabase JWT before
 * signing anything.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

let s3: S3Client | null = null;
let admin: SupabaseClient | null = null;

export function bucket(): string | undefined {
  return env('R2_BUCKET');
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
export function asyncRoute(
  handler: (req: Request, res: Response) => Promise<unknown>,
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
      res.status(503).json({
        error: 'Media storage is temporarily unavailable. Please try again.',
      });
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

  const result = await client.send(new DeleteObjectsCommand({
    Bucket: bucketName,
    Delete: { Objects: keys, Quiet: true },
  }));

  const errors = result.Errors ?? [];
  if (errors.length) {
    const first = errors[0];
    throw new Error(
      `R2 delete failed for ${errors.length} of ${keys.length} object(s); ` +
      `first: ${first.Key ?? '(unknown key)'} — ${first.Code ?? 'unknown'}: ${first.Message ?? 'no message'}`,
    );
  }
}

export interface Caller {
  userId: string;
  isAdmin: boolean;
  isActivated: boolean;
}

/** Verifies the bearer token with Supabase and resolves the caller's role. */
export async function authenticate(req: Request): Promise<Caller | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const db = getAdmin();
  if (!db) return null;

  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await db.from('profiles').select('role, activated_at').eq('id', data.user.id).single();
  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  return { userId: data.user.id, isAdmin: profile?.role === 'admin', isActivated: profile?.role === 'admin' || !!profile?.activated_at };
}
