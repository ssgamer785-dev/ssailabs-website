/**
 * Chat media endpoints, backed by Cloudflare R2 (S3-compatible).
 *
 * R2 credentials and the Supabase service-role key live only in this process —
 * the browser never sees either. The bucket is private, so the client holds no
 * durable URLs: it asks here for short-lived signed PUT/GET URLs, and every
 * request is authorized against the caller's Supabase JWT and their membership
 * of the conversation in question.
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

/**
 * Drops the oldest media in a conversation until it fits back under the quota.
 * The database picks the victims, R2 deletion happens here, then the rows are
 * flagged purged — so a failed R2 call can't leave the DB claiming space is free.
 */
async function enforceQuota(conversationId: string): Promise<number> {
  const db = getAdmin();
  const client = getS3();
  const b = bucket();
  if (!db || !client || !b) return 0;

  const { data, error } = await db.rpc('select_chat_media_to_purge', {
    p_conversation_id: conversationId,
    p_limit_bytes: MEDIA_QUOTA_BYTES,
  });
  if (error || !data?.length) return 0;

  const victims = data as { id: string; storage_key: string }[];
  await client.send(new DeleteObjectsCommand({
    Bucket: b,
    Delete: { Objects: victims.map(v => ({ Key: v.storage_key })), Quiet: true },
  }));
  await db.rpc('mark_chat_media_purged', { p_message_ids: victims.map(v => v.id) });
  return victims.length;
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

  /** Issues a short-lived signed PUT. The key is generated here — a client
   *  never chooses where its bytes land. */
  router.post('/upload-url', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { conversationId, kind, mimeType, sizeBytes } = req.body ?? {};
    if (!conversationId || !kind || !mimeType || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'conversationId, kind, mimeType and sizeBytes are required.' });
    }
    if (!ALLOWED_MIME[kind]) return res.status(400).json({ error: `Unsupported attachment kind "${kind}".` });
    if (!ALLOWED_MIME[kind].test(mimeType)) {
      return res.status(400).json({ error: `${mimeType} is not an allowed ${kind} type.` });
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
      return res.status(413).json({ error: `That ${kind} is larger than the ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB limit.` });
    }
    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    const storageKey = `chat/${conversationId}/${Date.now()}-${randomUUID()}.${EXTENSION[kind]}`;
    // ContentType and ContentLength are part of the signature, so the upload
    // cannot exceed the size we just validated.
    const url = await getSignedUrl(
      getS3()!,
      new PutObjectCommand({ Bucket: bucket()!, Key: storageKey, ContentType: mimeType, ContentLength: sizeBytes }),
      { expiresIn: PUT_URL_TTL_SECONDS },
    );

    res.json({ uploadUrl: url, storageKey, quotaBytes: MEDIA_QUOTA_BYTES });
  });

  /** Called after the message row exists; brings the student back under quota. */
  router.post('/finalize', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { conversationId } = req.body ?? {};
    if (!conversationId) return res.status(400).json({ error: 'conversationId is required.' });
    if (!(await canAccessConversation(caller, conversationId))) {
      return res.status(403).json({ error: 'You do not have access to this conversation.' });
    }

    const purged = await enforceQuota(conversationId);
    const { data } = await getAdmin()!
      .from('conversations').select('media_bytes_used').eq('id', conversationId).single();

    res.json({ purged, mediaBytesUsed: data?.media_bytes_used ?? 0, quotaBytes: MEDIA_QUOTA_BYTES });
  });

  /** Short-lived signed GET for one object the caller is allowed to see. */
  router.get('/media-url', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const storageKey = String(req.query.key ?? '');
    // Keys are `chat/<conversationId>/...`; the conversation segment is what
    // authorizes the read, so a caller can't hand us an arbitrary path.
    const conversationId = storageKey.split('/')[1];
    if (!storageKey.startsWith('chat/') || !conversationId) {
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

  /** Removes the R2 object behind a message the caller deleted. */
  router.post('/delete-media', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { messageId } = req.body ?? {};
    if (!messageId) return res.status(400).json({ error: 'messageId is required.' });

    const db = getAdmin()!;
    const { data: message } = await db
      .from('messages').select('id, conversation_id, sender_id, storage_key').eq('id', messageId).single();
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    // Only the sender may destroy their own media, mirroring the DB's delete rule.
    if (message.sender_id !== caller.userId) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    if (message.storage_key) {
      await getS3()!.send(new DeleteObjectsCommand({
        Bucket: bucket()!,
        Delete: { Objects: [{ Key: message.storage_key }], Quiet: true },
      }));
      await db.rpc('mark_chat_media_purged', { p_message_ids: [message.id] });
    }
    res.json({ ok: true });
  });

  return router;
}
