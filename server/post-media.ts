/**
 * Community post attachments on Cloudflare R2.
 *
 * Reads are open to any authenticated user because posts RLS already makes
 * every post readable to signed-in members; writes are keyed to the uploader,
 * and deletes are restricted to the post's author or an admin.
 */

import { Router, type Response } from 'express';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { posix as posixPath } from 'path';
import { asyncRoute, authenticate, bucket, deleteObjects, getAdmin, getS3 } from './r2';

const PUT_URL_TTL_SECONDS = 300;
const GET_URL_TTL_SECONDS = 900;

const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
};

const ALLOWED_MIME: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|heic)$/i,
  video: /^video\/(mp4|quicktime|webm)$/i,
  pdf: /^application\/pdf$/i,
};

const EXTENSION: Record<string, string> = { image: 'bin', video: 'bin', pdf: 'pdf' };

/** A generated JPEG frame; anything larger is not a thumbnail. */
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
const POSTER_MIME = 'image/jpeg';

/**
 * The object a caller-supplied post media key is actually allowed to read, or
 * null when it must not be signed at all.
 *
 * Checking `startsWith('posts/')` is not enough, and the reason is easy to
 * miss: the AWS SDK resolves "." and ".." out of the path *before* it signs,
 * so `posts/../chat/<id>/voice.webm` is signed as `chat/<id>/voice.webm` — a
 * correctly signed URL for someone else's private chat attachment, issued by
 * the posts endpoint, which never runs the conversation-membership check that
 * chat-media.ts does. The prefix has to hold on the *resolved* key, not the
 * one the caller typed.
 *
 * So traversal is refused outright rather than collapsed, and the normalised
 * result is checked again. Mirrors conversationFromKey() on the chat side,
 * which has always rejected these segments.
 *
 * Deliberately not asserting the rest of the key's shape: every key we mint is
 * `posts/<uploader-uuid>/<millis>-<uuid>.<ext>`, but pinning that here would
 * reject any legitimate object stored under an older naming scheme, and it
 * buys nothing — once the resolved key is inside `posts/`, private media in
 * `chat/` is unreachable by construction.
 */
export function postObjectKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const key = raw.trim();
  if (!key || key.length > 1024) return null;

  // Absolute paths, Windows separators, control characters and anything with a
  // URI scheme are never keys we issued.
  if (key.startsWith('/') || key.includes('\\')) return null;
  // Control characters, written as codepoints rather than a regex escape so
  // the check cannot be broken by an editor folding the escape into a literal.
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(key)) return null;

  // Our keys never contain a percent sign. Refusing it closes the encoded
  // variants (%2e%2e, %2f) without this function having to guess how many
  // times some downstream layer might decode.
  if (key.includes('%')) return null;

  // Explicit traversal, current-directory and empty segments.
  const segments = key.split('/');
  if (segments.some(part => part === '' || part === '.' || part === '..')) return null;

  // Belt and braces: whatever survived the above must still resolve inside the
  // posts namespace, which is the property the signer actually depends on.
  const resolved = posixPath.normalize(key);
  if (resolved !== key) return null;
  if (!resolved.startsWith('posts/') || resolved.length <= 'posts/'.length) return null;

  return resolved;
}

function signPut(key: string, mimeType: string, sizeBytes: number): Promise<string> {
  // ContentType and ContentLength are signed, so the upload can't exceed
  // the size we just validated.
  return getSignedUrl(
    getS3()!,
    new PutObjectCommand({ Bucket: bucket()!, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn: PUT_URL_TTL_SECONDS },
  );
}

export function postMediaRouter(): Router {
  const router = Router();

  const requireConfigured = (res: Response) => {
    if (!getS3() || !bucket()) {
      res.status(503).json({ error: 'Post media storage is not configured on this server.' });
      return false;
    }
    if (!getAdmin()) {
      res.status(503).json({ error: 'Server is missing Supabase service credentials.' });
      return false;
    }
    return true;
  };

  /** Signed PUT. The key is server-generated and namespaced by uploader. */
  router.post('/upload-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { kind, mimeType, sizeBytes, posterBytes } = req.body ?? {};
    if (!kind || !mimeType || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'kind, mimeType and sizeBytes are required.' });
    }
    if (!ALLOWED_MIME[kind]) return res.status(400).json({ error: `Unsupported attachment kind "${kind}".` });
    if (!ALLOWED_MIME[kind].test(mimeType)) {
      return res.status(400).json({ error: `${mimeType} is not an allowed ${kind} type.` });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
      return res.status(413).json({ error: `That ${kind} is larger than the ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB limit.` });
    }

    const wantsPoster = kind === 'video' && typeof posterBytes === 'number' && posterBytes > 0;
    if (wantsPoster && (!Number.isFinite(posterBytes) || posterBytes > MAX_POSTER_BYTES)) {
      return res.status(413).json({ error: 'That thumbnail is too large.' });
    }

    const stem = `posts/${caller.userId}/${Date.now()}-${randomUUID()}`;
    const storageKey = `${stem}.${EXTENSION[kind]}`;
    const uploadUrl = await signPut(storageKey, mimeType, sizeBytes);

    const posterKey = wantsPoster ? `${stem}-poster.jpg` : undefined;
    const posterUploadUrl = posterKey ? await signPut(posterKey, POSTER_MIME, posterBytes) : undefined;

    res.json({ uploadUrl, storageKey, posterUploadUrl, posterKey });
  }));

  /** Signed GET. Any signed-in member may read post media. */
  router.get('/media-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    // Resolved, not just prefixed: see postObjectKey().
    const storageKey = postObjectKey(req.query.key);
    if (!storageKey) {
      return res.status(400).json({ error: 'Invalid media key.' });
    }

    const url = await getSignedUrl(
      getS3()!,
      new GetObjectCommand({ Bucket: bucket()!, Key: storageKey }),
      { expiresIn: GET_URL_TTL_SECONDS },
    );
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  }));

  /** Clears the R2 object behind a post the caller is allowed to remove. */
  router.post('/delete-media', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { postId } = req.body ?? {};
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = getAdmin()!;
    const { data: post } = await db.from('posts')
      .select('id, author_id, storage_key, poster_key').eq('id', postId).single();
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.author_id !== caller.userId && !caller.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    const keys = [post.storage_key, post.poster_key]
      .filter((k): k is string => !!k)
      .map(Key => ({ Key }));

    if (keys.length) {
      // R2 first: a failure throws, so the row is never marked purged while
      // its object is still in the bucket.
      await deleteObjects(getS3()!, bucket()!, keys);
      await db.rpc('mark_post_media_purged', { p_post_ids: [post.id] });
    }
    res.json({ ok: true });
  }));

  /**
   * Runs the 6-month community retention sweep: clears the expired posts' R2
   * objects, then deletes the rows. Admin-only, so it can be triggered by an
   * external scheduler holding an admin token (see supabase/README.md).
   */
  router.post('/run-retention', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });

    const db = getAdmin()!;
    const { data: expired } = await db.rpc('select_expired_post_media');
    const victims = (expired ?? []) as { id: string; storage_key: string | null; poster_key: string | null }[];
    const keys = victims
      .flatMap(v => [v.storage_key, v.poster_key])
      .filter((k): k is string => !!k)
      .map(Key => ({ Key }));

    if (keys.length) {
      await deleteObjects(getS3()!, bucket()!, keys);
    }
    const { data: deleted } = await db.rpc('purge_expired_posts');
    res.json({ mediaCleared: victims.length, postsDeleted: deleted ?? 0 });
  }));

  return router;
}
