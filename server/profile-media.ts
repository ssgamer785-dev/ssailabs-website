/**
 * Profile pictures on Cloudflare R2.
 *
 * The rule this router exists to enforce is that a caller can only ever touch
 * their OWN avatar. It is enforced structurally rather than by checking a
 * parameter: no endpoint here takes a user id. The key is built from
 * `caller.userId` — the id inside the verified Supabase JWT — so there is no
 * field an attacker could set to point at somebody else's object.
 *
 * Reads are a separate question. Avatars are shown next to posts and in the
 * admin inbox, so any signed-in member has to be able to read any avatar; what
 * they must not be able to do is read a NON-avatar object through this
 * endpoint, which is what avatarObjectKey() below is for.
 */

import { Router, type Response } from 'express';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { posix as posixPath } from 'path';
import { asyncRoute, authenticate, bucket, getAdmin, getS3 } from './r2';

const PUT_URL_TTL_SECONDS = 300;
/**
 * Longer than a post attachment's 15 minutes. An avatar is re-requested on
 * every screen that draws the person, so a short TTL means signing the same
 * object over and over; an hour cuts that without making a leaked URL useful
 * for meaningfully longer.
 */
const GET_URL_TTL_SECONDS = 3600;

/** A profile picture. Anything bigger is a photograph that was never resized. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = /^image\/(jpeg|png|webp|heic)$/i;

/**
 * The object a caller-supplied avatar key may be signed for, or null.
 *
 * Same reasoning as postObjectKey() in post-media.ts, and for the same reason:
 * the AWS SDK resolves "." and ".." out of a key BEFORE signing it, so
 * `avatars/../chat/<id>/voice.webm` would be signed as a private chat
 * attachment by an endpoint that never runs the conversation-membership check.
 * Traversal is refused outright, and the prefix is re-checked on the resolved
 * key rather than the one the caller typed.
 */
export function avatarObjectKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const key = raw.trim();
  if (!key || key.length > 1024) return null;
  if (key.startsWith('/') || key.includes('\\')) return null;

  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(key)) return null;
  // Our keys never contain a percent sign; refusing it closes the encoded
  // traversal variants without guessing how many times something decodes.
  if (key.includes('%')) return null;

  const segments = key.split('/');
  if (segments.some(part => part === '' || part === '.' || part === '..')) return null;

  const resolved = posixPath.normalize(key);
  if (resolved !== key) return null;
  if (!resolved.startsWith('avatars/') || resolved.length <= 'avatars/'.length) return null;

  return resolved;
}

export function profileMediaRouter(): Router {
  const router = Router();

  const requireConfigured = (res: Response) => {
    if (!getS3() || !bucket()) {
      res.status(503).json({ error: 'Profile picture storage is not configured on this server.' });
      return false;
    }
    if (!getAdmin()) {
      res.status(503).json({ error: 'Server is missing Supabase service credentials.' });
      return false;
    }
    return true;
  };

  /**
   * Signed PUT for the caller's own avatar.
   *
   * The response carries the key the client must then write to its profile
   * row. Writing it here instead would mean the row pointed at an object that
   * may never be uploaded — a broken image on every screen that draws them —
   * so the row is updated by the client after the bytes land.
   */
  router.post('/avatar-upload-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { mimeType, sizeBytes } = req.body ?? {};
    if (!mimeType || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'mimeType and sizeBytes are required.' });
    }
    if (!ALLOWED_AVATAR_MIME.test(mimeType)) {
      return res.status(400).json({ error: 'A profile picture must be a JPEG, PNG, WebP or HEIC image.' });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_AVATAR_BYTES) {
      return res.status(413).json({
        error: `That image is larger than the ${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB limit.`,
      });
    }

    // Namespaced by the CALLER's id, from the verified token. This is the whole
    // authorization story for writes: there is no id parameter to forge.
    const storageKey = `avatars/${caller.userId}/${Date.now()}-${randomUUID()}.bin`;
    const uploadUrl = await getSignedUrl(
      getS3()!,
      new PutObjectCommand({
        Bucket: bucket()!,
        Key: storageKey,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: PUT_URL_TTL_SECONDS },
    );

    res.json({ uploadUrl, storageKey });
  }));

  /** Signed GET. Any signed-in member may read any avatar; see the file note. */
  router.get('/avatar-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const storageKey = avatarObjectKey(req.query.key);
    if (!storageKey) return res.status(400).json({ error: 'Invalid avatar key.' });

    const url = await getSignedUrl(
      getS3()!,
      new GetObjectCommand({ Bucket: bucket()!, Key: storageKey }),
      { expiresIn: GET_URL_TTL_SECONDS },
    );
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  }));

  /**
   * Removes the caller's picture: the bucket object first, then the column.
   *
   * That order matters. Clearing the column first and failing on the delete
   * leaves an object nothing points at, which nothing will ever clean up
   * because the key is gone. Failing the other way round leaves a row pointing
   * at a deleted object, which renders as the initials placeholder — visibly
   * the same as success, and recoverable by pressing Remove again.
   */
  router.post('/avatar-delete', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const db = getAdmin()!;
    const { data: profile } = await db
      .from('profiles').select('avatar_key').eq('id', caller.userId).single();

    const key = profile?.avatar_key;
    if (key) {
      // Re-derived, not trusted: even a key already in the row is only deleted
      // when it sits under this caller's own prefix.
      const resolved = avatarObjectKey(key);
      if (!resolved || !resolved.startsWith(`avatars/${caller.userId}/`)) {
        return res.status(409).json({ error: 'Stored avatar key is not one this account owns.' });
      }
      await getS3()!.send(new DeleteObjectsCommand({
        Bucket: bucket()!,
        Delete: { Objects: [{ Key: resolved }], Quiet: true },
      }));
    }

    const { error } = await db
      .from('profiles').update({ avatar_key: null }).eq('id', caller.userId);
    if (error) return res.status(500).json({ error: 'Could not clear the profile picture.' });

    res.json({ ok: true });
  }));

  return router;
}
