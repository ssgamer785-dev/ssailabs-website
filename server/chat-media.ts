/**
 * Chat media endpoints, backed by Cloudflare R2 (S3-compatible).
 *
 * R2 credentials and the Supabase service-role key live only in this process —
 * the browser never sees either. The bucket is private, so the client holds no
 * durable URLs: it asks here for short-lived signed PUT/GET URLs, and every
 * request is authorized against the caller's Supabase JWT and their membership
 * of the conversation in question.
 *
 * The 100 MB per-user cap is enforced here, not in the browser. A
 * client can lie about anything it sends; what it cannot do is get a signed URL
 * without this file agreeing to issue one.
 */

import { Router, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { asyncRoute, authenticate, batchKeys, bucket, deleteObjects, getAdmin, getS3, MAX_BATCH_KEYS, servedAs, signedPutUrl, type Caller } from './r2.js';
import { recordUploadGrant } from './upload-grants.js';

/** Hard cap on stored chat media per user, enforced oldest-first. */
export const MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;

const PUT_URL_TTL_SECONDS = 300;
const GET_URL_TTL_SECONDS = 900;

/** Per-file ceilings, checked before a PUT URL is issued. */
const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  file: 25 * 1024 * 1024,
  voice: 10 * 1024 * 1024,
};

/** A generated JPEG frame; anything larger is not a thumbnail. */
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
const POSTER_MIME = 'image/jpeg';

const ALLOWED_MIME: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|heic)$/i,
  video: /^video\/(mp4|quicktime|webm)$/i,
  pdf: /^application\/pdf$/i,
  file: /^(application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-(excel|powerpoint)|vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)|zip|x-zip-compressed)|text\/(plain|csv))$/i,
  voice: /^audio\/(webm|mp4|mpeg|ogg|aac|wav)(;.*)?$/i,
};

const EXTENSION: Record<string, string> = {
  image: 'bin',
  video: 'bin',
  pdf: 'pdf',
  file: 'bin',
  voice: 'webm',
};

/** True when the caller is the conversation's student, or any admin. */
async function canAccessConversation(caller: Caller, conversationId: string): Promise<boolean> {
  if (!caller.isActivated) return false;
  if (caller.isAdmin) return true;
  const db = getAdmin();
  if (!db) return false;
  const { data } = await db.from('conversations').select('student_id').eq('id', conversationId).single();
  return data?.student_id === caller.userId;
}

/**
 * Of these conversations (lower-cased), the ones the caller may read: the
 * same rule as canAccessConversation() — an activated caller's own thread, or
 * any thread for an admin — answered with one read for a whole batch.
 */
async function readableConversations(caller: Caller, conversationIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(conversationIds.map(id => id.toLowerCase()))];
  const readable = new Set<string>();
  if (!caller.isActivated || !ids.length) return readable;
  if (caller.isAdmin) return new Set(ids);
  const db = getAdmin();
  if (!db) return readable;
  const { data, error } = await db.from('conversations').select('id, student_id').in('id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as { id: string; student_id: string }[]) {
    if (row.student_id === caller.userId) readable.add(String(row.id).toLowerCase());
  }
  return readable;
}

interface ChatObjectRow { id: string; kind: string; mime_type: string | null; file_name: string | null; conversation_id: string; storage_key: string | null; poster_key: string | null }

/**
 * Each key's live message in the key's own conversation: the message that
 * holds it as its object, else the one that holds it as its video poster.
 * Deleted messages and purged media are never found, and a row in another
 * conversation never vouches for a key (the key's own conversation is what
 * the caller was checked against). All reads run together.
 */
export async function findChatObjects(db: SupabaseClient, keys: { key: string; conversationId: string }[]): Promise<Map<string, { from: 'object' | 'poster'; row: ChatObjectRow }>> {
  const found = new Map<string, { from: 'object' | 'poster'; row: ChatObjectRow }>();
  if (!keys.length) return found;
  const list = [...new Set(keys.map(k => k.key))];
  const columns = 'id, kind, mime_type, file_name, conversation_id, storage_key, poster_key';
  const [objects, posters] = await Promise.all([
    db.from('messages').select(columns).is('deleted_at', null).eq('media_purged', false).in('storage_key', list),
    db.from('messages').select(columns).is('deleted_at', null).eq('media_purged', false).in('poster_key', list),
  ]);
  if (objects.error) throw objects.error;
  if (posters.error) throw posters.error;
  const sameConversation = (row: ChatObjectRow, conversationId: string) => String(row.conversation_id).toLowerCase() === conversationId.toLowerCase();
  for (const { key, conversationId } of keys) {
    const object = ((objects.data ?? []) as ChatObjectRow[]).find(row => row.storage_key === key && sameConversation(row, conversationId));
    if (object) { found.set(key, { from: 'object', row: object }); continue; }
    const poster = ((posters.data ?? []) as ChatObjectRow[]).find(row => row.poster_key === key && sameConversation(row, conversationId));
    if (poster) found.set(key, { from: 'poster', row: poster });
  }
  return found;
}

/** How a found chat object is served: its recorded type when allowed for its kind (else a plain download); a poster is a JPEG. */
function servedForChatObject(found: { from: 'object' | 'poster'; row: ChatObjectRow }): ReturnType<typeof servedAs> {
  if (found.from === 'poster') return servedAs({ mimeType: POSTER_MIME, allowed: true, download: false });
  const { row } = found;
  return servedAs({
    mimeType: row.mime_type,
    allowed: !!ALLOWED_MIME[row.kind]?.test(row.mime_type ?? ''),
    download: row.kind === 'file',
    fileName: row.file_name,
  });
}

function signChatGet(key: string, served: ReturnType<typeof servedAs>): Promise<string> {
  return getSignedUrl(getS3()!, new GetObjectCommand({ Bucket: bucket()!, Key: key, ...served }), { expiresIn: GET_URL_TTL_SECONDS });
}

export interface PurgeVictim {
  id: string;
  storage_key: string | null;
  poster_key: string | null;
}

/**
 * Every R2 key a set of rows owns — the object itself and, for video, its
 * poster. Purging without this is how thumbnails become orphans nothing
 * references and nobody stops paying for.
 */
export function objectKeysFor(victims: PurgeVictim[]): { Key: string }[] {
  return victims
    .flatMap(v => [v.storage_key, v.poster_key])
    .filter((k): k is string => !!k)
    .map(Key => ({ Key }));
}

/**
 * The conversation a media key belongs to.
 *
 * Keys are minted here as `chat/<conversationId>/<file>`, so the second segment
 * is what authorizes a read: whoever asks for a signed URL must be a member of
 * *that* conversation. Anything not shaped like one of our keys returns null
 * and the caller refuses, which is what stops a crafted path — another
 * student's conversation id, a traversal, a key from the posts namespace —
 * from being signed.
 */
export function conversationFromKey(storageKey: string): string | null {
  if (typeof storageKey !== 'string') return null;
  const segments = storageKey.split('/');
  if (segments.length < 3) return null;
  if (segments[0] !== 'chat') return null;

  const conversationId = segments[1];
  // A uuid and nothing else: no traversal, no wildcards, no empty segment.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)) {
    return null;
  }
  // A key that walks back out of its own prefix is not ours.
  if (segments.some(part => part === '..' || part === '.' || part === '')) return null;

  return conversationId;
}

/** One ordinary file name, which is all a minted key ever ends in: no path, no traversal. */
const OBJECT_LEAF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

/**
 * Whether `key` names an object inside `conversationId`'s own namespace.
 *
 * Message rows are written by clients, so a key read back from a row proves
 * nothing on its own. Before this server signs or deletes anything a row
 * names, the key must resolve to the row's own conversation.
 */
export function isConversationObjectKey(key: unknown, conversationId: unknown): key is string {
  if (typeof key !== 'string' || typeof conversationId !== 'string') return false;
  const owner = conversationFromKey(key);
  if (!owner || owner.toLowerCase() !== conversationId.toLowerCase()) return false;
  const segments = key.split('/');
  return segments.length === 3 && OBJECT_LEAF.test(segments[2]) && !segments[2].includes('..');
}

/** The extension /upload-url gives a key. Voice keeps a real audio extension so players pick the decoder. */
export function chatUploadExtension(kind: string, mimeType: string): string {
  if (kind !== 'voice') return EXTENSION[kind];
  return /^audio\/mp4/i.test(mimeType) ? 'm4a' : /^audio\/aac/i.test(mimeType) ? 'aac'
    : /^audio\/ogg/i.test(mimeType) ? 'ogg' : /^audio\/wav/i.test(mimeType) ? 'wav' : 'webm';
}

/**
 * Whether a pending row's keys are the shape /upload-url mints for that
 * conversation: `chat/<conversation>/<millis>-<uuid>.<ext>`, and for a video
 * poster exactly `<same stem>-poster.jpg`.
 */
export function isResumableChatUpload(row: { conversation_id: unknown; storage_key: unknown; poster_key: unknown }): boolean {
  if (!isConversationObjectKey(row.storage_key, row.conversation_id)) return false;
  const leaf = row.storage_key.split('/')[2];
  const minted = /^(\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{2,5}$/i.exec(leaf);
  if (!minted) return false;
  if (row.poster_key == null) return true;
  return row.poster_key === `chat/${row.storage_key.split('/')[1]}/${minted[1]}-poster.jpg`;
}

type Db = NonNullable<ReturnType<typeof getAdmin>>;

/**
 * Whether any message other than `messageId` names one of `keys`. An object is
 * only ever signed or deleted on behalf of the one row that owns it.
 */
async function referencedByAnotherMessage(db: Db, messageId: string, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    for (const column of ['storage_key', 'poster_key'] as const) {
      const { data, error } = await db.from('messages').select('id').eq(column, key).neq('id', messageId).limit(1);
      if (error) throw error;
      if (data?.length) return true;
    }
  }
  return false;
}

/**
 * The keys of `rows` this server may delete: inside each row's own
 * conversation and named by no other message. Anything else is left in the
 * bucket untouched; the row itself is still cleaned up by the caller.
 */
async function ownedObjectKeys(db: Db, rows: PurgeVictim[]): Promise<{ Key: string }[]> {
  if (!rows.length) return [];
  const { data, error } = await db.from('messages').select('id, conversation_id').in('id', rows.map(row => row.id));
  if (error) throw error;
  const conversationOf = new Map((data ?? []).map(row => [row.id as string, row.conversation_id as string]));
  const owned: { Key: string }[] = [];
  for (const row of rows) {
    const conversationId = conversationOf.get(row.id);
    for (const key of [row.storage_key, row.poster_key]) {
      if (!key) continue;
      if (isConversationObjectKey(key, conversationId) && !(await referencedByAnotherMessage(db, row.id, [key]))) {
        owned.push({ Key: key });
      } else {
        console.error('[media] left an object in place: it is not owned by the row being cleaned up', row.id);
      }
    }
  }
  return owned;
}

export interface UploadRequest {
  kind: string;
  mimeType: string;
  sizeBytes: number;
  posterBytes?: number;
}

export type UploadCheck =
  | { status: 'ok'; totalBytes: number; wantsPoster: boolean }
  | { status: 'rejected'; code: number; error: string };

/**
 * Everything about an upload request that can be decided without touching the
 * database. Kept pure and exported so the rules can be tested directly — this
 * is the only thing standing between a hand-rolled HTTP call and the bucket,
 * so "the client already checked" is never a reason to skip a check here.
 *
 * String-discriminated on purpose: this project's tsconfig does not enable
 * `strict`, and a boolean-literal discriminant does not narrow reliably.
 */
export function validateUploadRequest(req: UploadRequest): UploadCheck {
  const { kind, mimeType, sizeBytes, posterBytes } = req;

  if (!kind || !mimeType || typeof sizeBytes !== 'number') {
    return { status: 'rejected', code: 400, error: 'conversationId, kind, mimeType and sizeBytes are required.' };
  }
  if (!ALLOWED_MIME[kind]) {
    return { status: 'rejected', code: 400, error: `Unsupported attachment kind "${kind}".` };
  }
  if (!ALLOWED_MIME[kind].test(mimeType)) {
    return { status: 'rejected', code: 400, error: `${mimeType} is not an allowed ${kind} type.` };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
    return {
      status: 'rejected',
      code: 413,
      error: `That ${kind} is larger than the ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB limit.`,
    };
  }

  const wantsPoster = kind === 'video' && typeof posterBytes === 'number' && posterBytes > 0;
  if (wantsPoster && (!Number.isFinite(posterBytes as number) || (posterBytes as number) > MAX_POSTER_BYTES)) {
    return { status: 'rejected', code: 413, error: 'That thumbnail is too large.' };
  }

  const totalBytes = sizeBytes + (wantsPoster ? (posterBytes as number) : 0);
  // No amount of cleanup can fit a file bigger than the whole allowance.
  if (totalBytes > MEDIA_QUOTA_BYTES) {
    return { status: 'rejected', code: 413, error: 'That file is larger than your 100 MB storage allowance.' };
  }

  return { status: 'ok', totalBytes, wantsPoster };
}

/**
 * Drops the uploader's own oldest media until `incomingBytes` will fit under
 * their personal cap. Returns how many attachments went.
 *
 * The quota belongs to the user, not the thread: the database only ever
 * nominates rows this user sent, so making room for one person can never
 * delete another person's media — including the admin's, whose uploads share
 * the student's thread.
 *
 * The database picks the victims, R2 deletion happens here, then the rows are
 * flagged purged — so a failed R2 call can't leave the DB claiming space is
 * free while the objects are still being paid for. Oldest first, always; the
 * newest media and every text message are untouched.
 */
async function makeRoom(userId: string, incomingBytes: number): Promise<number> {
  const db = getAdmin();
  const client = getS3();
  const b = bucket();
  if (!db || !client || !b) return 0;

  const { data, error } = await db.rpc('select_user_media_to_purge', {
    p_user_id: userId,
    p_limit_bytes: MEDIA_QUOTA_BYTES,
    p_incoming_bytes: incomingBytes,
  });
  if (error || !data?.length) return 0;

  const victims = data as PurgeVictim[];
  const keys = await ownedObjectKeys(db, victims);

  // R2 first. deleteObjects throws on a partial failure too, so the rows are
  // only marked purged once every object is genuinely gone.
  await deleteObjects(client, b, keys);
  await db.rpc('mark_chat_media_purged', { p_message_ids: victims.map(v => v.id) });
  return victims.length;
}

/**
 * Clears uploads that were started but never finished — a client that died
 * mid-PUT leaves a pending row, and possibly bytes in the bucket that nothing
 * will ever reference. Same two-phase shape as the quota purge.
 *
 * Exported so a scheduler can call it; also runs opportunistically, at most
 * once every ten minutes, off the back of a finalize.
 */
export async function sweepStaleUploads(): Promise<number> {
  const db = getAdmin();
  const client = getS3();
  const b = bucket();
  if (!db || !client || !b) return 0;

  const { data, error } = await db.rpc('select_stale_pending_uploads');
  if (error || !data?.length) return 0;

  const stale = data as PurgeVictim[];
  const keys = await ownedObjectKeys(db, stale);

  await deleteObjects(client, b, keys);
  const { data: removed } = await db.rpc('delete_stale_pending_uploads', {
    p_message_ids: stale.map(v => v.id),
  });
  return Number(removed) || 0;
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = 0;

function maybeSweep(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  sweepStaleUploads().catch(() => {});
}

/** What this user stores across every thread — the figure the cap applies to. */
async function currentUsage(userId: string): Promise<number> {
  const { data } = await getAdmin()!
    .from('profiles').select('media_bytes_used').eq('id', userId).single();
  return Number(data?.media_bytes_used ?? 0);
}

function signPut(key: string, mimeType: string, sizeBytes: number): Promise<string> {
  // Type and size are part of the signature: the upload cannot exceed the size
  // we just validated or arrive as a different type.
  return signedPutUrl(key, mimeType, sizeBytes, PUT_URL_TTL_SECONDS);
}

export function chatMediaRouter(): Router {
  const router = Router();

  const requireConfigured = (res: Response) => {
    if (!getS3() || !bucket()) {
      res.status(503).json({ error: 'Chat media storage is not configured on this server.' });
      return false;
    }
    if (!getAdmin()) {
      res.status(503).json({ error: 'Server is missing Supabase service credentials.' });
      return false;
    }
    return true;
  };

  /**
   * Issues a short-lived signed PUT, after making room for the file.
   *
   * The key is generated here — a client never chooses where its bytes land.
   */
  router.post('/upload-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { conversationId, kind, mimeType, sizeBytes, posterBytes } = req.body ?? {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId, kind, mimeType and sizeBytes are required.' });
    }

    const check = validateUploadRequest({ kind, mimeType, sizeBytes, posterBytes });
    if (check.status === 'rejected') return res.status(check.code).json({ error: check.error });
    const { totalBytes, wantsPoster } = check;

    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    // The caller's own oldest media goes first, and only as much as this
    // upload actually needs. Nobody else's attachments are eligible.
    const purged = await makeRoom(caller.userId, totalBytes);

    const stem = `chat/${conversationId}/${Date.now()}-${randomUUID()}`;
    const storageKey = `${stem}.${chatUploadExtension(kind, mimeType)}`;
    const uploadUrl = await signPut(storageKey, mimeType, sizeBytes);

    const posterKey = wantsPoster ? `${stem}-poster.jpg` : undefined;
    const posterUploadUrl = posterKey
      ? await signPut(posterKey, POSTER_MIME, posterBytes)
      : undefined;

    await recordUploadGrant(getAdmin()!, {
      storageKey, ownerId: caller.userId, scope: 'chat', conversationId,
      kind, mimeType, sizeBytes, posterKey, posterSizeBytes: posterKey ? posterBytes : null,
    });

    res.json({
      uploadUrl,
      storageKey,
      posterUploadUrl,
      posterKey,
      quotaBytes: MEDIA_QUOTA_BYTES,
      purged,
      mediaBytesUsed: await currentUsage(caller.userId),
    });
  }));

  /**
   * Re-signs the PUT for an upload that already has a row. Retrying reuses the
   * original key, so a half-written object is overwritten rather than joined by
   * a second one that nothing references.
   */
  router.post('/resume-upload', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { messageId } = req.body ?? {};
    if (!messageId) return res.status(400).json({ error: 'messageId is required.' });

    const db = getAdmin()!;
    const { data: message } = await db
      .from('messages')
      .select('id, conversation_id, sender_id, kind, storage_key, poster_key, mime_type, size_bytes, poster_size_bytes, upload_status')
      .eq('id', messageId)
      .single();

    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.sender_id !== caller.userId) {
      return res.status(403).json({ error: 'You can only resume your own uploads.' });
    }
    if (!(await canAccessConversation(caller, message.conversation_id))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }
    if (message.upload_status !== 'pending' || !message.storage_key) {
      return res.status(409).json({ error: 'That upload has already finished.' });
    }

    // The row was written by the client, so it is held to what /upload-url
    // would have issued for it: a key minted for this conversation, a size and
    // type within the limits, and an object no other message names.
    const invalid = () => res.status(400).json({ error: 'Invalid upload.' });
    if (!isResumableChatUpload(message)) return invalid();
    const check = validateUploadRequest({
      kind: message.kind,
      mimeType: message.mime_type,
      sizeBytes: Number(message.size_bytes),
      posterBytes: message.poster_key ? Number(message.poster_size_bytes) : undefined,
    });
    if (check.status === 'rejected') return res.status(check.code).json({ error: check.error });
    if (message.poster_key && !check.wantsPoster) return invalid();
    const keys = [message.storage_key, message.poster_key].filter((k): k is string => !!k);
    if (await referencedByAnotherMessage(db, message.id, keys)) return invalid();

    const uploadUrl = await signPut(
      message.storage_key,
      message.mime_type || 'application/octet-stream',
      Number(message.size_bytes) || 0,
    );
    const posterUploadUrl = message.poster_key
      ? await signPut(message.poster_key, POSTER_MIME, Number(message.poster_size_bytes) || 0)
      : undefined;

    res.json({
      uploadUrl,
      storageKey: message.storage_key,
      posterUploadUrl,
      posterKey: message.poster_key ?? undefined,
    });
  }));

  /**
   * Reconciles storage after a send. Room is made before the upload, so this
   * normally finds nothing — it catches what the pre-flight cannot see, such as
   * two devices uploading to the same conversation at once.
   */
  router.post('/finalize', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { conversationId } = req.body ?? {};
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required.' });
    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    const purged = await makeRoom(caller.userId, 0);
    maybeSweep();

    res.json({
      purged,
      mediaBytesUsed: await currentUsage(caller.userId),
      quotaBytes: MEDIA_QUOTA_BYTES,
    });
  }));

  /** Short-lived signed GET for one object the caller is allowed to see. */
  router.get('/media-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const storageKey = String(req.query.key ?? '');
    // The conversation segment of the key is what authorizes the read, so a
    // caller can't hand us an arbitrary path.
    const conversationId = conversationFromKey(storageKey);
    if (!conversationId) {
      return res.status(400).json({ error: 'Invalid media key.' });
    }
    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this media.' });
    }

    const found = (await findChatObjects(getAdmin()!, [{ key: storageKey, conversationId }])).get(storageKey);
    if (!found) return res.status(404).json({ error: 'Attachment unavailable.' });
    const url = await signChatGet(storageKey, servedForChatObject(found));
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  }));

  /**
   * Signed GETs for a screen's worth of keys (up to MAX_BATCH_KEYS) in one
   * request. Every key passes the checks /media-url makes: shaped like a key
   * this server mints, in a conversation the caller may read, and named by a
   * live message of that same conversation. A key that /media-url would
   * refuse is listed under `failed` with the status it would have answered
   * (400 / 403 / 404); private media is never signed for anyone else.
   */
  router.post('/media-urls', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    const keys = batchKeys(req.body?.keys);
    if (!keys) return res.status(400).json({ error: `Send 1 to ${MAX_BATCH_KEYS} media keys.` });

    const urls: Record<string, { url: string; expiresIn: number }> = {};
    const failed: Record<string, number> = {};
    const wanted: { key: string; conversationId: string }[] = [];
    for (const key of keys) {
      // The conversation segment of the key is what authorizes the read.
      const conversationId = conversationFromKey(key);
      if (conversationId) wanted.push({ key, conversationId }); else failed[key] = 400;
    }
    const readable = await readableConversations(caller, wanted.map(w => w.conversationId));
    const allowed = wanted.filter(w => {
      if (readable.has(w.conversationId.toLowerCase())) return true;
      failed[w.key] = 403;
      return false;
    });
    const found = await findChatObjects(getAdmin()!, allowed);
    await Promise.all(allowed.map(async ({ key }) => {
      const hit = found.get(key);
      if (!hit) { failed[key] = 404; return; }
      urls[key] = { url: await signChatGet(key, servedForChatObject(hit)), expiresIn: GET_URL_TTL_SECONDS };
    }));
    res.json({ urls, failed });
  }));

  /**
   * Removes the R2 objects behind a message the caller deleted. An upload that
   * never finished is removed entirely — there is no message to leave behind.
   */
  router.post('/delete-media', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { messageId } = req.body ?? {};
    if (!messageId) return res.status(400).json({ error: 'messageId is required.' });

    const db = getAdmin()!;
    const { data: message, error: messageError } = await db
      .from('messages')
      .select('id, conversation_id, sender_id, storage_key, poster_key, upload_status')
      .eq('id', messageId)
      .single();
    if (messageError && messageError.code !== 'PGRST116') throw messageError;
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    // Only the sender may destroy their own media, mirroring the DB's delete rule.
    if (message.sender_id !== caller.userId) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }
    if (!(await canAccessConversation(caller, message.conversation_id))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    // Keys come from a client-written row: only objects inside this message's
    // conversation, and named by no other message, are ever deleted here.
    const names = [message.storage_key, message.poster_key].filter((k): k is string => !!k);
    if (names.some(key => !isConversationObjectKey(key, message.conversation_id))
      || await referencedByAnotherMessage(db, message.id, names)) {
      return res.status(409).json({ error: 'This attachment cannot be removed.' });
    }
    const keys = names.map(Key => ({ Key }));

    await deleteObjects(getS3()!, bucket()!, keys);

    if (message.upload_status === 'pending') {
      const { error } = await db.rpc('delete_stale_pending_uploads', { p_message_ids: [message.id] });
      if (error) throw error;
    } else if (message.storage_key) {
      const { error } = await db.rpc('mark_chat_media_purged', { p_message_ids: [message.id] });
      if (error) throw error;
    }
    res.json({ ok: true });
  }));

  return router;
}
