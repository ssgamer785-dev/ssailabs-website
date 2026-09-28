/**
 * Admin-only clean-up of media files nothing uses any more (TP-030).
 *
 * Each call lists one page of the bucket under one of the app's own prefixes
 * and sorts every object into three piles:
 *
 *   - in use: a row still names it — a chat message, a post, a profile
 *     picture, an upload grant, or one of the older link columns the app no
 *     longer writes;
 *   - recent: younger than an hour, so an upload may still be on its way to
 *     the row that will name it;
 *   - unused: everything else.
 *
 * A dry run reports the piles; a delete (with the typed confirmation) removes
 * the unused pile and nothing else. Only chat/, posts/ and avatars/ are ever
 * listed, and a listed key outside the requested prefix is ignored, so files
 * that belong to anything other than this app are never touched.
 */
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { asyncRoute, authenticate, bucket, deleteObjects, getAdmin, getS3 } from './r2.js';

export const CLEANUP_PREFIXES = ['chat/', 'posts/', 'avatars/'] as const;
export type CleanupPrefix = typeof CLEANUP_PREFIXES[number];
export const CLEANUP_CONFIRM_WORD = 'DELETE';
/** Longer than any upload URL lives (5 minutes) plus the moment its row takes to write. */
export const CLEANUP_MIN_AGE_MS = 60 * 60 * 1000;
/** One listing page; also the most one DeleteObjects call accepts. */
const LIST_PAGE = 1000;
/** Supabase answers at most 1000 rows per request by default. */
const ROW_PAGE = 1000;

/** Columns that hold an object key exactly. */
const KEY_COLUMNS: readonly [table: string, column: string][] = [
  ['messages', 'storage_key'], ['messages', 'poster_key'],
  ['posts', 'storage_key'], ['posts', 'poster_key'],
  ['profiles', 'avatar_key'],
  ['media_upload_grants', 'storage_key'], ['media_upload_grants', 'poster_key'],
];

/** Older link columns. An object whose key appears anywhere inside one is kept. */
const LINK_COLUMNS: readonly [table: string, column: string][] = [
  ['messages', 'media_url'], ['posts', 'attachment_url'], ['comments', 'voice_url'], ['profiles', 'avatar_url'],
];

/** The grants table arrives with the R1 migration; before it, there are no grants to honour. */
const OPTIONAL_TABLES = new Set(['media_upload_grants']);
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

/**
 * Every non-null value of one column. Pages by the value itself rather than by
 * offset, so a row added or removed while the pages are read cannot shift a
 * value out of view.
 */
async function columnValues(db: SupabaseClient, table: string, column: string): Promise<string[]> {
  const values: string[] = [];
  let last: string | null = null;
  for (;;) {
    let query = db.from(table).select(column).not(column, 'is', null).order(column, { ascending: true }).limit(ROW_PAGE);
    if (last !== null) query = query.gt(column, last);
    const { data, error } = await query;
    if (error) {
      if (OPTIONAL_TABLES.has(table) && MISSING_TABLE_CODES.has(error.code ?? '')) return values;
      throw error;
    }
    const page = ((data ?? []) as unknown as Record<string, unknown>[])
      .map(row => row[column])
      .filter((value): value is string => typeof value === 'string');
    values.push(...page);
    if (page.length < ROW_PAGE) return values;
    last = page[page.length - 1];
  }
}

export interface References {
  keys: Set<string>;
  links: string[];
}

/** What the database names right now, read after the listing so nothing listed can be missed. */
export async function loadReferences(db: SupabaseClient): Promise<References> {
  const keyLists = await Promise.all(KEY_COLUMNS.map(([table, column]) => columnValues(db, table, column)));
  const linkLists = await Promise.all(LINK_COLUMNS.map(([table, column]) => columnValues(db, table, column)));
  return { keys: new Set(keyLists.flat()), links: linkLists.flat() };
}

export function isReferenced(key: string, refs: References): boolean {
  return refs.keys.has(key) || refs.links.some(link => link.includes(key));
}

export interface CleanupPage {
  prefix: CleanupPrefix;
  scanned: number;
  inUse: number;
  recent: number;
  unused: number;
  unusedBytes: number;
  deleted: number;
  /** Pass back as `after` for the next page; null when the prefix is done. */
  next: string | null;
}

export function storageCleanupRouter(): Router {
  const router = Router();

  router.post('/unreferenced', asyncRoute(async (req, res) => {
    const s3 = getS3();
    const db = getAdmin();
    if (!s3 || !db || !bucket()) return res.status(503).json({ error: 'Media storage is not configured on the server.' });
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });

    const { prefix, after, remove, confirm } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof prefix !== 'string' || !(CLEANUP_PREFIXES as readonly string[]).includes(prefix)) {
      return res.status(400).json({ error: 'Unknown storage area.' });
    }
    if (after !== undefined && after !== null && (typeof after !== 'string' || !after.startsWith(prefix) || after.length > 1024)) {
      return res.status(400).json({ error: 'Invalid position.' });
    }
    if (remove !== undefined && typeof remove !== 'boolean') return res.status(400).json({ error: 'Invalid request.' });
    if (remove && confirm !== CLEANUP_CONFIRM_WORD) {
      return res.status(400).json({ error: `Type ${CLEANUP_CONFIRM_WORD} to confirm.` });
    }

    const listing = await s3.send(new ListObjectsV2Command({
      Bucket: bucket()!,
      Prefix: prefix,
      MaxKeys: LIST_PAGE,
      ...(typeof after === 'string' ? { StartAfter: after } : {}),
    }));
    const listed = listing.Contents ?? [];
    const refs = await loadReferences(db);
    const oldest = Date.now() - CLEANUP_MIN_AGE_MS;

    let inUse = 0;
    let recent = 0;
    let unusedBytes = 0;
    const unused: { Key: string }[] = [];
    for (const object of listed) {
      const key = object.Key;
      if (!key || !key.startsWith(prefix)) continue;
      if (isReferenced(key, refs)) { inUse++; continue; }
      const modified = object.LastModified ? new Date(object.LastModified).getTime() : NaN;
      if (!Number.isFinite(modified) || modified > oldest) { recent++; continue; }
      unused.push({ Key: key });
      unusedBytes += Number(object.Size ?? 0);
    }

    if (remove && unused.length) {
      await deleteObjects(s3, bucket()!, unused);
      console.info(`[storage-cleanup] admin ${caller.userId} deleted ${unused.length} unused object(s) under ${prefix}`);
    }

    const lastListed = listed.length ? listed[listed.length - 1].Key ?? null : null;
    const page: CleanupPage = {
      prefix: prefix as CleanupPrefix,
      scanned: inUse + recent + unused.length,
      inUse,
      recent,
      unused: unused.length,
      unusedBytes,
      deleted: remove ? unused.length : 0,
      next: listing.IsTruncated && lastListed ? lastListed : null,
    };
    res.json(page);
  }, 'Storage clean-up is temporarily unavailable. Please try again.'));

  return router;
}
