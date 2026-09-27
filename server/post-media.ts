/**
 * Community post attachments on Cloudflare R2.
 *
 * Reads are open to any authenticated user because posts RLS already makes
 * every post readable to signed-in members; writes are keyed to the uploader,
 * and deletes are restricted to the post's author or an admin.
 */

import { Router, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { posix as posixPath } from 'path';
import { asyncRoute, authenticate, bucket, deleteObjects, getAdmin, getS3, servedAs, signedPutUrl } from './r2.js';
import { recordUploadGrant } from './upload-grants.js';

const PUT_URL_TTL_SECONDS = 300;
const GET_URL_TTL_SECONDS = 900;

const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  file: 25 * 1024 * 1024,
  voice: 10 * 1024 * 1024,
};

const ALLOWED_MIME: Record<string, RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|heic)$/i,
  video: /^video\/(mp4|quicktime|webm)$/i,
  pdf: /^application\/pdf$/i,
  /**
   * 'file' is the office-document kind, not "anything at all".
   *
   * An allowlist rather than a deny-list, and deliberately without
   * application/octet-stream: that is the type a browser reports for anything
   * it does not recognise, so allowing it would allow every extension there
   * is, including the executable ones. A format that is not on this list is
   * refused rather than quietly stored.
   */
  file: new RegExp(
    '^(' +
    'application/msword|' +
    'application/vnd\\.openxmlformats-officedocument\\.(wordprocessingml\\.document|spreadsheetml\\.sheet|presentationml\\.presentation)|' +
    'application/vnd\\.ms-(excel|powerpoint)|' +
    'application/vnd\\.oasis\\.opendocument\\.(text|spreadsheet|presentation)|' +
    'application/(zip|x-zip-compressed)|' +
    'text/(plain|csv)' +
    ')$', 'i',
  ),
  voice: /^audio\/(webm|mp4|mpeg|ogg|aac|wav)(;.*)?$/i,
};

const EXTENSION: Record<string, string> = { image: 'bin', video: 'bin', pdf: 'pdf', file: 'bin', voice: 'bin' };

/** Whether `kind` is an attachment kind this server accepts at all. */
export function isAttachmentKind(kind: unknown): kind is keyof typeof MAX_BYTES {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_MIME, kind);
}

/**
 * Whether a file of `mimeType` may be uploaded as `kind`.
 *
 * Extracted so the allowlist can be tested directly. The 'file' kind is the
 * one that matters: it is the only kind whose name suggests "anything", and
 * the only one where letting application/octet-stream through would turn the
 * endpoint into general-purpose file hosting — octet-stream is what a browser
 * reports for every extension it does not recognise, including executables.
 */
export function isAllowedAttachment(kind: unknown, mimeType: unknown): boolean {
  if (!isAttachmentKind(kind) || typeof mimeType !== 'string') return false;
  return ALLOWED_MIME[kind].test(mimeType);
}

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

/**
 * The extension /upload-url mints for this attachment. Voice keeps a real
 * audio extension so players pick the right decoder; everything else is
 * opaque. Shared with /resume-upload: when the two disagreed, every retry of
 * an admin voice post was refused as "Invalid upload key".
 */
export function postUploadExtension(kind: string, mimeType: string): string {
  if (kind !== 'voice') return EXTENSION[kind];
  return /^audio\/mp4/i.test(mimeType) ? 'm4a' : /^audio\/aac/i.test(mimeType) ? 'aac'
    : /^audio\/ogg/i.test(mimeType) ? 'ogg' : /^audio\/wav/i.test(mimeType) ? 'wav' : 'webm';
}

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** `posts/<uuid>/<13 digits>-<uuid>.<ext>` or its `-poster.jpg`: the shapes /upload-url mints. */
const MINTED_POST_KEY = new RegExp(`^posts/${UUID_RE}/\\d{13}-${UUID_RE}(\\.[a-z0-9]{2,5}|-poster\\.jpg)$`, 'i');

/**
 * A new post object's key. It carries a random id, not the author's: the key
 * is visible to every member who can see the post and sits in its signed URL,
 * so an author id in it would name the author of an anonymous post. The upload
 * grant recorded for the author is what proves ownership later. Only when
 * grants cannot be recorded yet (API ahead of the migration) does the key fall
 * back to the author namespace, so every object stays provably owned.
 */
export function newPostStem(ownerSegment: string): string {
  return `posts/${ownerSegment}/${Date.now()}-${randomUUID()}`;
}

/** Whether `key` has the shape /upload-url mints for this attachment (either key generation). */
export function isResumablePostKey(key: string, kind: string, mimeType: string): boolean {
  return MINTED_POST_KEY.test(key) && !key.endsWith('-poster.jpg') && key.endsWith(`.${postUploadExtension(kind, mimeType)}`);
}

/**
 * Of `keys`, the ones `authorId` uploaded. Keys minted before author-free keys
 * carry the author's id (`posts/<author>/…`); an author-free key counts only
 * when the author's upload grant for it (main object or poster) exists.
 */
export async function ownedPostKeys(db: SupabaseClient, authorId: unknown, keys: (string | null | undefined)[]): Promise<Set<string>> {
  const owned = new Set<string>();
  if (typeof authorId !== 'string' || !authorId) return owned;
  const lookup: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    const resolved = postObjectKey(key);
    if (!resolved || resolved !== key) continue;
    if (key.startsWith(`posts/${authorId}/`)) owned.add(key);
    else if (MINTED_POST_KEY.test(key)) lookup.push(key);
  }
  if (lookup.length) {
    const [main, posters] = await Promise.all([
      db.from('media_upload_grants').select('storage_key').eq('owner_id', authorId).eq('scope', 'post').in('storage_key', lookup),
      db.from('media_upload_grants').select('poster_key').eq('owner_id', authorId).eq('scope', 'post').in('poster_key', lookup),
    ]);
    if (main.error) throw main.error;
    if (posters.error) throw posters.error;
    for (const grant of main.data ?? []) owned.add(grant.storage_key as string);
    for (const grant of posters.data ?? []) if (grant.poster_key) owned.add(grant.poster_key as string);
  }
  return owned;
}

/**
 * Whether `key` is in the author's own legacy namespace (`posts/<author>/…`).
 * Author-free keys need ownedPostKeys(), which consults the upload grants.
 */
export function isAuthorPostKey(key: unknown, authorId: unknown): key is string {
  if (typeof authorId !== 'string' || !authorId) return false;
  const resolved = postObjectKey(key);
  return !!resolved && resolved === key && resolved.startsWith(`posts/${authorId}/`);
}

/**
 * The name a download is saved under. For another member viewing an anonymous
 * post it is neutral ("Attachment.docx"): an original file name often carries
 * the author's own name, and it would sit in the signed URL too. Same rule as
 * the feed functions apply to file_name.
 */
export function downloadName(
  post: { file_name?: string | null; author_id?: string | null; is_anonymous?: boolean | null },
  caller: { userId: string; isAdmin: boolean },
): string | null {
  if (!post.file_name) return null;
  if (!post.is_anonymous || caller.isAdmin || post.author_id === caller.userId) return post.file_name;
  const extension = /(\.[A-Za-z0-9]{1,5})$/.exec(post.file_name)?.[1]?.toLowerCase() ?? '';
  return `Attachment${extension}`;
}

function signPut(key: string, mimeType: string, sizeBytes: number): Promise<string> {
  // Type and size are signed: the upload can't exceed the size we just
  // validated or arrive as a different type.
  return signedPutUrl(key, mimeType, sizeBytes, PUT_URL_TTL_SECONDS);
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
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });

    const { kind, mimeType, sizeBytes, posterBytes } = req.body ?? {};
    if (!kind || !mimeType || typeof sizeBytes !== 'number') {
      return res.status(400).json({ error: 'kind, mimeType and sizeBytes are required.' });
    }
    if (!isAttachmentKind(kind)) return res.status(400).json({ error: `Unsupported attachment kind "${kind}".` });
    if (kind === 'voice' && !caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });
    if (!isAllowedAttachment(kind, mimeType)) {
      return res.status(400).json({ error: `${mimeType} is not an allowed ${kind} type.` });
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
      return res.status(413).json({ error: `That ${kind} is larger than the ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB limit.` });
    }

    const wantsPoster = kind === 'video' && typeof posterBytes === 'number' && posterBytes > 0;
    if (wantsPoster && (!Number.isFinite(posterBytes) || posterBytes > MAX_POSTER_BYTES)) {
      return res.status(413).json({ error: 'That thumbnail is too large.' });
    }

    const extension = postUploadExtension(kind, mimeType);
    let stem = newPostStem(randomUUID());
    let storageKey = `${stem}.${extension}`;
    let posterKey = wantsPoster ? `${stem}-poster.jpg` : undefined;
    const recorded = await recordUploadGrant(getAdmin()!, {
      storageKey, ownerId: caller.userId, scope: 'post',
      kind, mimeType, sizeBytes, posterKey, posterSizeBytes: posterKey ? posterBytes : null,
    });
    if (!recorded) {
      // No grant table yet: an author-free key could never be proven to be
      // this author's, so use the author namespace until the migration runs.
      stem = newPostStem(caller.userId);
      storageKey = `${stem}.${extension}`;
      posterKey = wantsPoster ? `${stem}-poster.jpg` : undefined;
    }

    const uploadUrl = await signPut(storageKey, mimeType, sizeBytes);
    const posterUploadUrl = posterKey ? await signPut(posterKey, POSTER_MIME, posterBytes) : undefined;

    res.json({ uploadUrl, storageKey, posterUploadUrl, posterKey });
  }));

  /** Re-sign a failed upload for the caller's original key, avoiding orphans. */
  router.post('/resume-upload', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });
    const { storageKey, posterKey, kind, mimeType, sizeBytes, posterBytes } = req.body ?? {};
    const key = postObjectKey(storageKey);
    if (kind === 'voice' && !caller.isAdmin) return res.status(403).json({ error: 'Admins only.' });
    if (!key || !isAllowedAttachment(kind, mimeType)
      || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES[kind]) {
      return res.status(400).json({ error: 'Invalid upload.' });
    }
    if (!isResumablePostKey(key, kind, mimeType) || !(await ownedPostKeys(getAdmin()!, caller.userId, [key])).has(key)) {
      return res.status(400).json({ error: 'Invalid upload key.' });
    }
    const { data: published, error: publishedError } = await getAdmin()!.from('posts').select('id').eq('storage_key', key).maybeSingle();
    if (publishedError) throw publishedError;
    if (published) return res.status(409).json({ error: 'This attachment has already been published.' });
    const poster = posterKey == null ? null : postObjectKey(posterKey);
    if (posterKey != null && (poster !== `${key.replace(/\.bin$/, '')}-poster.jpg` || kind !== 'video'
      || !Number.isFinite(posterBytes) || posterBytes <= 0 || posterBytes > MAX_POSTER_BYTES)) {
      return res.status(400).json({ error: 'Invalid video thumbnail.' });
    }
    const uploadUrl = await signPut(key, mimeType, sizeBytes);
    const posterUploadUrl = poster ? await signPut(poster, POSTER_MIME, posterBytes) : undefined;
    res.json({ uploadUrl, storageKey: key, posterKey: poster ?? undefined, posterUploadUrl });
  }));

  /** Signed GET. Any signed-in member may read post media. */
  router.get('/media-url', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });

    // Resolved, not just prefixed: see postObjectKey().
    const storageKey = postObjectKey(req.query.key);
    if (!storageKey) {
      return res.status(400).json({ error: 'Invalid media key.' });
    }

    const db = getAdmin()!;
    const base = () => db.from('posts').select('id, attachment, mime_type, file_name, author_id, is_anonymous').eq('media_purged', false);
    const { data: object, error: objectError } = await base().eq('storage_key', storageKey).maybeSingle();
    if (objectError) throw objectError;
    const { data: poster, error: posterError } = object ? { data: object, error: null } : await base().eq('poster_key', storageKey).maybeSingle();
    if (posterError) throw posterError;
    if (!object && !poster) return res.status(404).json({ error: 'Attachment unavailable.' });

    const served = object
      ? servedAs({
          mimeType: object.mime_type,
          allowed: isAllowedAttachment(object.attachment, object.mime_type),
          download: object.attachment === 'file',
          fileName: downloadName(object, caller),
        })
      : servedAs({ mimeType: POSTER_MIME, allowed: true, download: false });
    const url = await getSignedUrl(
      getS3()!,
      new GetObjectCommand({ Bucket: bucket()!, Key: storageKey, ...served }),
      { expiresIn: GET_URL_TTL_SECONDS },
    );
    res.json({ url, expiresIn: GET_URL_TTL_SECONDS });
  }));

  /** Clears the R2 object behind a post the caller is allowed to remove. */
  router.post('/delete-media', asyncRoute(async (req, res) => {
    if (!requireConfigured(res)) return;
    const caller = await authenticate(req);
    if (!caller) return res.status(401).json({ error: 'Not authenticated.' });
    if (!caller.isActivated) return res.status(403).json({ error: 'Activate your account first.' });

    const { postId } = req.body ?? {};
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = getAdmin()!;
    const { data: post, error: postError } = await db.from('posts')
      .select('id, author_id, storage_key, poster_key').eq('id', postId).single();
    if (postError && postError.code !== 'PGRST116') throw postError;
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.author_id !== caller.userId && !caller.isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    // Keys come from a client-written row: only the author's own objects are deleted here.
    const names = [post.storage_key, post.poster_key].filter((k): k is string => !!k);
    const owned = await ownedPostKeys(db, post.author_id, names);
    if (names.some(key => !owned.has(key))) {
      return res.status(409).json({ error: 'This attachment cannot be removed.' });
    }
    const keys = names.map(Key => ({ Key }));

    if (keys.length) {
      // R2 first: a failure throws, so the row is never marked purged while
      // its object is still in the bucket.
      await deleteObjects(getS3()!, bucket()!, keys);
      const { error: purgeError } = await db.rpc('mark_post_media_purged', { p_post_ids: [post.id] });
      if (purgeError) throw purgeError;
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
    // Only objects inside each expired post's own author namespace are
    // deleted; anything else a row names is left in the bucket.
    const authorOf = new Map<string, string>();
    if (victims.length) {
      const { data: owners, error: ownersError } = await db.from('posts').select('id, author_id').in('id', victims.map(v => v.id));
      if (ownersError) throw ownersError;
      for (const row of owners ?? []) authorOf.set(row.id as string, row.author_id as string);
    }
    const keys: { Key: string }[] = [];
    for (const victim of victims) {
      const owned = await ownedPostKeys(db, authorOf.get(victim.id), [victim.storage_key, victim.poster_key]);
      for (const key of [victim.storage_key, victim.poster_key]) {
        if (!key) continue;
        if (owned.has(key)) keys.push({ Key: key });
        else console.error('[media] retention left an object in place: it is not owned by its post', victim.id);
      }
    }

    if (keys.length) {
      await deleteObjects(getS3()!, bucket()!, keys);
    }
    const { data: deleted } = await db.rpc('purge_expired_posts');
    res.json({ mediaCleared: victims.length, postsDeleted: deleted ?? 0 });
  }));

  return router;
}
