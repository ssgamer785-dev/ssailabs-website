/**
 * Shared Cloudflare R2 + Supabase plumbing for the media routers.
 *
 * R2 credentials and the service-role key exist only in this process. Both
 * routers authorize every request against the caller's Supabase JWT before
 * signing anything.
 */

import type { Request } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { S3Client } from '@aws-sdk/client-s3';

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

/** Service-role client. Bypasses RLS, so only use it after verifying the caller. */
export function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export interface Caller {
  userId: string;
  isAdmin: boolean;
}

/** Verifies the bearer token with Supabase and resolves the caller's role. */
export async function authenticate(req: Request): Promise<Caller | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const db = getAdmin();
  if (!db) return null;

  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user) return null;

  const { data: profile } = await db.from('profiles').select('role').eq('id', data.user.id).single();
  return { userId: data.user.id, isAdmin: profile?.role === 'admin' };
}
