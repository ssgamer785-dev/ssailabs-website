/**
 * Trading Journal screenshots on Cloudflare R2.
 *
 * A journal is private to its owner (journal_trades RLS), and so is every
 * picture in it. Like profile pictures, nothing here takes a user id: the key
 * of a new screenshot is built from the id inside the verified Supabase JWT
 * (journal/<caller>/<millis>-<uuid>.bin), and the database only lets a trade
 * name a key in its own owner's namespace. Reads are signed only for a trade
 * the caller owns, for a short while, and never publicly.
 *
 *   POST /upload-url            a signed PUT for one picture (type and size signed)
 *   GET  /screenshot-url?trade= a short-lived signed GET for the caller's own trade
 *   POST /discard               removes the caller's uploads that no trade uses
 *                               (a replaced or removed picture, an unsaved form)
 *   POST /trades/:id/delete     deletes the caller's trade and its picture
 */

import { Router, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { posix as posixPath } from 'path';
import { asyncRoute, authenticate, bucket, deleteObjects, getAdmin, getS3, servedAs, signedPutUrl, signStableGet } from './r2.js';

const PUT_URL_TTL_SECONDS = 300;
/** Private pictures: the signed address is short-lived and the browser keeps no long copy. */
const READ_WINDOW_SECONDS = 900;
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
/** HEIC from an iPhone is turned into a JPEG on the device before it is sent (as for every picture in the app). */
const ALLOWED_SCREENSHOT_MIME = /^image\/(jpeg|png|webp)$/i;
const MAX_DISCARD_KEYS = 10;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const MINTED_JOURNAL_KEY = new RegExp(`^journal/(${UUID})/\\d{13}-${UUID}\\.bin$`);

/**
 * The journal object a caller-supplied key names, or null when it must never be
 * signed or deleted. Same rules as avatarObjectKey()/postObjectKey(): the AWS
 * SDK resolves "." and ".." BEFORE signing, so traversal is refused outright
 * and the result must be exactly a key this server mints.
 */
export function journalObjectKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  if (!key || key.length > 200 || key !== raw) return null;
  if (key.startsWith('/') || key.includes('\\') || key.includes('%')) return null;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  if (key.split('/').some(part => part === '' || part === '.' || part === '..')) return null;
  if (posixPath.normalize(key) !== key) return null;
  return MINTED_JOURNAL_KEY.test(key) ? key : null;
}

/** Whether `key` is a journal object in `ownerId`'s own namespace. */
export function isOwnJournalKey(key: unknown, ownerId: string): key is string {
  const resolved = journalObjectKey(key);
  return !!resolved && resolved.startsWith(`journal/${ownerId}/`);
}

/** PostgREST / Postgres answers for a table the database does not have yet (journal migration not applied). */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01'
    || (/journal_trades/.test(error.message ?? '') && /does not exist|schema cache/i.test(error.message ?? ''));
}
const NEEDS_UPDATE = 'The Trading Journal needs the latest database update. Please try again later.';

/** Of `keys` (all the owner's own), the ones a trade still uses. */
async function keysInUse(db: SupabaseClient, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const { data, error } = await db.from('journal_trades').select('screenshot_key').in('screenshot_key', keys);
  if (error) throw error;
  return new Set((data ?? []).map(row => row.screenshot_key as string));
}

export function journalMediaRouter(): Router {
  const router = Router();

  const requireConfigured = (res: Response) => {
    if (!getS3() || !bucket()) {
      res.status(503).json({ error: 'Picture storage is not configured on this server.' });
      return false;
    }
    if (!getAdmin()) {
      res.status(503).json({ error: 'Server is missing Supabase service credentials.' });
      return false;
    }
    return true;
  };

  router.post('/upload-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });

    const { mimeType, sizeBytes } = req.body ?? {};
    if (typeof mimeType !== 'string' || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'mimeType and sizeBytes are required.' });
    }
    if (!ALLOWED_SCREENSHOT_MIME.test(mimeType)) {
      return res.status(400).json({ error: 'A screenshot must be a JPEG, PNG or WebP image.' });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SCREENSHOT_BYTES) {
      return res.status(413).json({ error: `That image is larger than the ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB limit.` });
    }

    // Namespaced by the CALLER's id from the verified token: there is no id parameter to forge.
    const storageKey = `journal/${caller.userId}/${Date.now()}-${randomUUID()}.bin`;
    // Type and size are signed: the upload arrives as the picture type it declared, no bigger.
    const uploadUrl = await signedPutUrl(storageKey, mimeType.toLowerCase(), sizeBytes, PUT_URL_TTL_SECONDS);
    res.json({ uploadUrl, storageKey });
  }));

  router.get('/screenshot-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });

    const tradeId = req.query.trade;
    if (typeof tradeId !== 'string' || !UUID_RE.test(tradeId)) return res.status(400).json({ error: 'Invalid trade.' });

    const { data: trade, error } = await getAdmin()!
      .from('journal_trades').select('user_id, screenshot_key, screenshot_mime').eq('id', tradeId).maybeSingle();
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ error: NEEDS_UPDATE });
      throw error;
    }
    // Someone else's trade answers exactly like a missing one: nothing to learn by guessing ids.
    if (!trade || trade.user_id !== caller.userId || !trade.screenshot_key) {
      return res.status(404).json({ error: 'Screenshot not found.' });
    }
    if (!isOwnJournalKey(trade.screenshot_key, caller.userId)) {
      return res.status(409).json({ error: 'This trade names a picture this account does not own.' });
    }
    const mime = typeof trade.screenshot_mime === 'string' ? trade.screenshot_mime : null;
    const signed = await signStableGet(
      trade.screenshot_key,
      servedAs({ mimeType: mime, allowed: !!mime && ALLOWED_SCREENSHOT_MIME.test(mime), download: false }),
      { windowSeconds: READ_WINDOW_SECONDS, keepPrivateCopyShort: true },
    );
    res.json(signed);
  }));

  router.post('/discard', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const raw = req.body?.keys;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DISCARD_KEYS) {
      return res.status(400).json({ error: `Send 1 to ${MAX_DISCARD_KEYS} keys.` });
    }
    // Only ever the caller's own uploads; anything else is ignored, not an error to learn from.
    const own = [...new Set(raw.filter((key): key is string => isOwnJournalKey(key, caller.userId)))];
    let used: Set<string>;
    try {
      used = await keysInUse(getAdmin()!, own);
    } catch (error) {
      if (isMissingTable(error as { code?: string })) used = new Set();
      else throw error;
    }
    // A picture a trade still shows is never removed, whatever the client asks.
    const unused = own.filter(key => !used.has(key));
    await deleteObjects(getS3()!, bucket()!, unused.map(Key => ({ Key })));
    res.json({ deleted: unused.length });
  }));

  /**
   * The picture first, then the row (as for profile pictures): if removing the
   * picture fails, the trade is still there to retry; the other way round would
   * leave an object nothing points at and nothing will ever clean up.
   */
  router.post('/trades/:id/delete', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const tradeId = req.params.id;
    if (!UUID_RE.test(tradeId)) return res.status(400).json({ error: 'Invalid trade.' });

    const db = getAdmin()!;
    const { data: trade, error } = await db.from('journal_trades').select('user_id, screenshot_key').eq('id', tradeId).maybeSingle();
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ error: NEEDS_UPDATE });
      throw error;
    }
    if (!trade || trade.user_id !== caller.userId) return res.status(404).json({ error: 'This trade no longer exists.' });

    if (trade.screenshot_key) {
      if (isOwnJournalKey(trade.screenshot_key, caller.userId)) {
        await deleteObjects(getS3()!, bucket()!, [{ Key: trade.screenshot_key }]);
      } else {
        console.error('[journal] a trade named a picture outside its owner\'s namespace; the picture was left in place');
      }
    }
    const { error: deleteError } = await db.from('journal_trades').delete().eq('id', tradeId).eq('user_id', caller.userId);
    if (deleteError) throw deleteError;
    res.json({ ok: true });
  }));

  return router;
}

/**
 * A deleted member's journal goes with them (it is private: no one may read it
 * any more). Removes the pictures, then the rows. Used by the Delete member
 * route after the member has been closed; safe to run again.
 */
export async function removeMemberJournal(db: SupabaseClient, memberId: string): Promise<{ trades: number; pictures: number }> {
  const { data, error } = await db.from('journal_trades').select('id, screenshot_key').eq('user_id', memberId);
  if (error) {
    if (isMissingTable(error)) return { trades: 0, pictures: 0 };
    throw error;
  }
  const rows = data ?? [];
  const keys = rows.map(row => row.screenshot_key).filter((key): key is string => isOwnJournalKey(key, memberId));
  if (keys.length) {
    const s3 = getS3();
    const name = bucket();
    // Without storage the rows stay too, so a later retry still knows which pictures to remove.
    if (!s3 || !name) throw new Error('Picture storage is not configured on this server.');
    await deleteObjects(s3, name, keys.map(Key => ({ Key })));
  }
  if (rows.length) {
    const { error: deleteError } = await db.from('journal_trades').delete().eq('user_id', memberId);
    if (deleteError) throw deleteError;
  }
  return { trades: rows.length, pictures: keys.length };
}
