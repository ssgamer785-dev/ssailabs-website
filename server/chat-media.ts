/**
 * Chat media endpoints, backed by Cloudflare R2 (S3-compatible).
 *
 * R2 credentials and the Supabase service-role key live only in this process —
 * the browser never sees either. The bucket is private, so the client holds no
 * durable URLs: it asks here for short-lived signed PUT/GET URLs, and every
 * request is authorized against the caller's Supabase JWT and their membership
 * of the conversation in question.
 *
 * The 100 MB per-conversation cap is enforced here, not in the browser. A
 * client can lie about anything it sends; what it cannot do is get a signed URL
 * without this file agreeing to issue one.
 */

import { Router, type Response } from 'express';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { authenticate, bucket, getAdmin, getS3, type Caller } from './r2';

/** Hard cap on stored chat media per student, enforced FIFO. */
export const MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;

const PUT_URL_TTL_SECONDS = 300;
const GET_URL_TTL_SECONDS = 900;

/** Per-file ceilings, checked before a PUT URL is issued. */
const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  voice: 10 * 1024 * 1024,
};

/** A generated JPEG frame; anything larger is not a thumbnail. */
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
const POSTER_MIME = 'image/jpeg';

const ALLOWED_MIME: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|heic)$/i,
  video: /^video\/(mp4|quicktime|webm)$/i,
  pdf: /^application\/pdf$/i,
  voice: /^audio\/(webm|mp4|mpeg|ogg|aac|wav)(;.*)?$/i,
};

const EXTENSION: Record<string, string> = {
  image: 'bin',
  video: 'bin',
  pdf: 'pdf',
  voice: 'webm',
};

/** True when the caller is the conversation's student, or any admin. */
async function canAccessConversation(caller: Caller, conversationId: string): Promise<boolean> {
  if (caller.isAdmin) return true;
  const db = getAdmin();
  if (!db) return false;
  const { data } = await db.from('conversations').select('student_id').eq('id', conversationId).single();
  return data?.student_id === caller.userId;
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
    return { status: 'rejected', code: 413, error: 'That file is larger than the 100 MB storage allowance for this chat.' };
  }

  return { status: 'ok', totalBytes, wantsPoster };
}

/**
 * Drops the oldest media in a conversation until `incomingBytes` will fit
 * under the cap. Returns how many attachments went.
 *
 * The database picks the victims, R2 deletion happens here, then the rows are
 * flagged purged — so a failed R2 call can't leave the DB claiming space is
 * free while the objects are still being paid for. Oldest first, always; the
 * newest media and every text message are untouched.
 */
async function makeRoom(conversationId: string, incomingBytes: number): Promise<number> {
  const db = getAdmin();
  const client = getS3();
  const b = bucket();
  if (!db || !client || !b) return 0;

  const { data, error } = await db.rpc('select_chat_media_to_purge', {
    p_conversation_id: conversationId,
    p_limit_bytes: MEDIA_QUOTA_BYTES,
    p_incoming_bytes: incomingBytes,
  });
  if (error || !data?.length) return 0;

  const victims = data as PurgeVictim[];
  const keys = objectKeysFor(victims);

  if (keys.length) {
    await client.send(new DeleteObjectsCommand({
      Bucket: b,
      Delete: { Objects: keys, Quiet: true },
    }));
  }
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
  const keys = objectKeysFor(stale);

  if (keys.length) {
    await client.send(new DeleteObjectsCommand({
      Bucket: b,
      Delete: { Objects: keys, Quiet: true },
    }));
  }
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

async function currentUsage(conversationId: string): Promise<number> {
  const { data } = await getAdmin()!
    .from('conversations').select('media_bytes_used').eq('id', conversationId).single();
  return Number(data?.media_bytes_used ?? 0);
}

function signPut(key: string, mimeType: string, sizeBytes: number): Promise<string> {
  // ContentType and ContentLength are part of the signature, so the upload
  // cannot exceed the size we just validated.
  return getSignedUrl(
    getS3()!,
    new PutObjectCommand({ Bucket: bucket()!, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn: PUT_URL_TTL_SECONDS },
  );
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
  router.post('/upload-url', async (req, res) => {
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

    // Oldest media goes first, and only as much as this upload actually needs.
    const purged = await makeRoom(conversationId, totalBytes);

    const stem = `chat/${conversationId}/${Date.now()}-${randomUUID()}`;
    const storageKey = `${stem}.${EXTENSION[kind]}`;
    const uploadUrl = await signPut(storageKey, mimeType, sizeBytes);

    const posterKey = wantsPoster ? `${stem}-poster.jpg` : undefined;
    const posterUploadUrl = posterKey
      ? await signPut(posterKey, POSTER_MIME, posterBytes)
      : undefined;

    res.json({
      uploadUrl,
      storageKey,
      posterUploadUrl,
      posterKey,
      quotaBytes: MEDIA_QUOTA_BYTES,
      purged,
      mediaBytesUsed: await currentUsage(conversationId),
    });
  });

  /**
   * Re-signs the PUT for an upload that already has a row. Retrying reuses the
   * original key, so a half-written object is overwritten rather than joined by
   * a second one that nothing references.
   */
  router.post('/resume-upload', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { messageId } = req.body ?? {};
    if (!messageId) return res.status(400).json({ error: 'messageId is required.' });

    const db = getAdmin()!;
    const { data: message } = await db
      .from('messages')
      .select('id, sender_id, storage_key, poster_key, mime_type, size_bytes, poster_size_bytes, upload_status')
      .eq('id', messageId)
      .single();

    if (!message) return res.status(404).json({ error: 'Message not found.' });
    if (message.sender_id !== caller.userId) {
      return res.status(403).json({ error: 'You can only resume your own uploads.' });
    }
    if (message.upload_status !== 'pending' || !message.storage_key) {
      return res.status(409).json({ error: 'That upload has already finished.' });
    }

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
  });

  /**
   * Reconciles storage after a send. Room is made before the upload, so this
   * normally finds nothing — it catches what the pre-flight cannot see, such as
   * two devices uploading to the same conversation at once.
   */
  router.post('/finalize', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { conversationId } = req.body ?? {};
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required.' });
    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    const purged = await makeRoom(conversationId, 0);
    maybeSweep();

    res.json({
      purged,
      mediaBytesUsed: await currentUsage(conversationId),
      quotaBytes: MEDIA_QUOTA_BYTES,
    });
  });

  /** Short-lived signed GET for one object the caller is allowed to see. */
  router.get('/media-url', async (req, res) => {
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

    const url = await getSignedUrl(
      getS3()!,
      new GetObjectCommand({ Bucket: bucket()!, Key: storageKey }),
      { expiresIn: GET_URL_TTL_SECONDS },
    );
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  });

  /**
   * Removes the R2 objects behind a message the caller deleted. An upload that
   * never finished is removed entirely — there is no message to leave behind.
   */
  router.post('/delete-media', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { messageId } = req.body ?? {};
    if (!messageId) return res.status(400).json({ error: 'messageId is required.' });

    const db = getAdmin()!;
    const { data: message } = await db
      .from('messages')
      .select('id, conversation_id, sender_id, storage_key, poster_key, upload_status')
      .eq('id', messageId)
      .single();
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    // Only the sender may destroy their own media, mirroring the DB's delete rule.
    if (message.sender_id !== caller.userId) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    const keys = [message.storage_key, message.poster_key]
      .filter((k): k is string => !!k)
      .map(Key => ({ Key }));

    if (keys.length) {
      await getS3()!.send(new DeleteObjectsCommand({
        Bucket: bucket()!,
        Delete: { Objects: keys, Quiet: true },
      }));
    }

    if (message.upload_status === 'pending') {
      await db.rpc('delete_stale_pending_uploads', { p_message_ids: [message.id] });
    } else if (message.storage_key) {
      await db.rpc('mark_chat_media_purged', { p_message_ids: [message.id] });
    }
    res.json({ ok: true });
  });

  return router;
}
