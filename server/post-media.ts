/**
 * Community post attachments on Cloudflare R2.
 *
 * Reads are open to any authenticated user because posts RLS already makes
 * every post readable to signed-in members; writes are keyed to the uploader,
 * and deletes are restricted to the post's author or an admin.
 */

import { Router, type Response } from 'express';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { authenticate, bucket, getAdmin, getS3 } from './r2';

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
  router.post('/upload-url', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { kind, mimeType, sizeBytes } = req.body ?? {};
    if (!kind || !mimeType || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'kind, mimeType and sizeBytes are required.' });
    }
    if (!ALLOWED_MIME[kind]) return res.status(400).json({ error: `Unsupported attachment kind "${kind}".` });
    if (!ALLOWED_MIME[kind].test(mimeType)) {
      return res.status(400).json({ error: `${mimeType} is not an allowed ${kind} type.` });
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
      return res.status(413).json({ error: `That ${kind} is larger than the ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB limit.` });
    }

    const storageKey = `posts/${caller.userId}/${Date.now()}-${randomUUID()}.${EXTENSION[kind]}`;
    // ContentType and ContentLength are signed, so the upload can't exceed
    // the size we just validated.
    const url = await getSignedUrl(
      getS3()!,
      new PutObjectCommand({ Bucket: bucket()!, Key: storageKey, ContentType: mimeType, ContentLength: sizeBytes }),
      { expiresIn: PUT_URL_TTL_SECONDS },
    );

    res.json({ uploadUrl: url, storageKey });
  });

  /** Signed GET. Any signed-in member may read post media. */
  router.get('/media-url', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const storageKey = String(req.query.key ?? '');
    if (!storageKey.startsWith('posts/')) {
      return res.status(400).json({ error: 'Invalid media key.' });
    }

    const url = await getSignedUrl(
      getS3()!,
      new GetObjectCommand({ Bucket: bucket()!, Key: storageKey }),
      { expiresIn: GET_URL_TTL_SECONDS },
    );
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  });

  /** Clears the R2 object behind a post the caller is allowed to remove. */
  router.post('/delete-media', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });

    const { postId } = req.body ?? {};
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = getAdmin()!;
    const { data: post } = await db.from('posts').select('id, author_id, storage_key').eq('id', postId).single();
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.author_id !== caller.userId && !caller.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    if (post.storage_key) {
      await getS3()!.send(new DeleteObjectsCommand({
        Bucket: bucket()!,
        Delete: { Objects: [{ Key: post.storage_key }], Quiet: true },
      }));
      await db.rpc('mark_post_media_purged', { p_post_ids: [post.id] });
    }
    res.json({ ok: true });
  });

  /**
   * Runs the 6-month community retention sweep: clears the expired posts' R2
   * objects, then deletes the rows. Admin-only, so it can be triggered by an
   * external scheduler holding an admin token (see supabase/README.md).
   */
  router.post('/run-retention', async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });

    const db = getAdmin()!;
    const { data: expired } = await db.rpc('select_expired_post_media');
    const victims = (expired ?? []) as { id: string; storage_key: string }[];

    if (victims.length) {
      await getS3()!.send(new DeleteObjectsCommand({
        Bucket: bucket()!,
        Delete: { Objects: victims.map(v => ({ Key: v.storage_key })), Quiet: true },
      }));
    }
    const { data: deleted } = await db.rpc('purge_expired_posts');
    res.json({ mediaCleared: victims.length, postsDeleted: deleted ?? 0 });
  });

  return router;
}
