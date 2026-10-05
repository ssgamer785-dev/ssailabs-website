/**
 * Display copies of community and chat pictures.
 *
 * The feed, the gallery tiles and the chat draw a picture at the size a phone
 * screen can show — at most 1080 × 1920, as a JPEG, turned upright, with every
 * bit of metadata (EXIF, GPS position, camera, editing history) removed —
 * instead of the full original, which is often ten or more times larger. The
 * full-screen viewer and downloads still use the original.
 *
 * A copy is stored at a key derived from its original's key, so nothing in the
 * database changes. A caller never names a copy: it is only signed after the
 * original itself has passed every access check, under the original's rules;
 * it is deleted whenever its original is (deleteObjects), and the storage
 * clean-up removes any copy whose original is gone.
 */
import { createHash } from 'crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

export const VARIANT_PREFIX = 'variants/v1/';
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1920;
/** Originals are at most 10 MB (MAX_BYTES.image); anything larger is left alone. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
/** A decoded original never takes more memory than the function has: about 160 MB at 40 megapixels. */
const MAX_SOURCE_PIXELS = 40_000_000;

/** The display copy of an original: the same for everyone, never derivable without the original's key. */
export function displayVariantKey(originalKey: string): string {
  return `${VARIANT_PREFIX}${createHash('sha256').update(originalKey).digest('hex')}.jpg`;
}

/** Originals a copy is made for. Not GIF (its animation would be lost); not HEIC (the app converts it before upload). */
export function isDisplayable(mimeType: string | null | undefined): boolean {
  return !!mimeType && /^image\/(jpeg|png|webp)$/i.test(mimeType);
}

/** Originals under the app's own media prefixes have copies; avatars and anything else do not. */
export function mayHaveVariant(key: string): boolean {
  return key.startsWith('posts/') || key.startsWith('chat/');
}

type Sharp = (typeof import('sharp'))['default'];
let sharpModule: Promise<Sharp | null> | null = null;
/** The image library could not be loaded in this deployment: no copy is offered or made. */
let sharpUnavailable = false;

/**
 * The image library, loaded the first time it is needed. Should it ever fail
 * to load, copies are simply not made: every picture keeps working from its
 * original, and nothing else in the API depends on it.
 */
const defaultLoader = () => import('sharp');
let importSharp: () => Promise<{ default: Sharp }> = defaultLoader;

/** For tests: how the image library is loaded (a failing loader stands for a deployment without it); null restores it. */
export function setImageLibraryLoaderForTests(loader: (() => Promise<{ default: Sharp }>) | null): void {
  importSharp = loader ?? defaultLoader;
  sharpModule = null;
  sharpUnavailable = false;
}

function loadSharp(): Promise<Sharp | null> {
  sharpModule ??= importSharp().then(
    module => module.default,
    (error: unknown) => {
      sharpUnavailable = true;
      console.error('[media-variants] the image library could not be loaded; pictures stay at full size:', error);
      return null;
    },
  );
  return sharpModule;
}

/**
 * Whether a display copy's address is worth handing out: not where the image
 * library is known not to load (the app would only try a copy that can never
 * be made, then fall back). Starts loading the library, without waiting for it.
 */
export function displayCopiesOffered(): boolean {
  void loadSharp();
  return !sharpUnavailable;
}

function notFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Whether the image library loads and works in this deployment: one 2 × 2
 * picture made into a JPEG. For a deployment check that needs no account and
 * reads nothing stored.
 */
export async function imageLibraryCheck(): Promise<{ ok: boolean; ms: number }> {
  const started = Date.now();
  const sharp = await loadSharp();
  if (!sharp) return { ok: false, ms: Date.now() - started };
  try {
    const out = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    return { ok: out.length > 0, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

/** Whether the copy already exists. */
export async function variantExists(s3: S3Client, bucketName: string, originalKey: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: displayVariantKey(originalKey) }));
    return true;
  } catch (error) {
    if (notFound(error)) return false;
    throw error;
  }
}

export type VariantOutcome = 'ready' | 'made' | 'skipped';

/**
 * Makes the display copy of one original unless it exists already. 'skipped'
 * when the original is not a still picture this can read (animated, too large,
 * or not an image after all): that picture is simply shown from its original.
 */
export async function ensureDisplayVariant(
  s3: S3Client, bucketName: string, originalKey: string, mimeType: string | null | undefined,
): Promise<VariantOutcome> {
  if (!isDisplayable(mimeType) || !mayHaveVariant(originalKey)) return 'skipped';
  if (await variantExists(s3, bucketName, originalKey)) return 'ready';
  const sharp = await loadSharp();
  if (!sharp) throw new Error('The image library is unavailable.');

  let input: Buffer;
  try {
    const got = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: originalKey }));
    if ((got.ContentLength ?? 0) > MAX_SOURCE_BYTES || !got.Body) return 'skipped';
    input = Buffer.from(await got.Body.transformToByteArray());
  } catch (error) {
    if (notFound(error)) return 'skipped';
    throw error;
  }
  if (input.length > MAX_SOURCE_BYTES) return 'skipped';

  let output: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: MAX_SOURCE_PIXELS, failOn: 'error' });
    const meta = await image.metadata();
    if ((meta.pages ?? 1) > 1) return 'skipped';
    output = await image
      .rotate()                                       // upright, from the EXIF orientation
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })              // a transparent screenshot stays readable
      .jpeg({ quality: meta.format === 'png' ? 82 : 76, progressive: true, mozjpeg: true })
      .toBuffer();                                     // no metadata is written unless asked for
  } catch {
    // Not a picture this library can read: shown from its original.
    return 'skipped';
  }

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: displayVariantKey(originalKey),
    Body: output,
    ContentType: 'image/jpeg',
    ContentLength: output.length,
    CacheControl: 'private, max-age=31536000, immutable',
  }));
  return 'made';
}

/**
 * Makes copies for several originals, a few at a time, within a time budget
 * (a request must answer well inside the function's limit). Whatever is not
 * reached comes back as pending; asking again finishes it.
 */
export async function ensureDisplayVariants(
  s3: S3Client, bucketName: string, items: { key: string; mimeType: string | null | undefined }[],
  { concurrency = 3, budgetMs = 7000 }: { concurrency?: number; budgetMs?: number } = {},
): Promise<{ ready: string[]; skipped: string[]; pending: string[]; failed: string[] }> {
  const started = Date.now();
  const out = { ready: [] as string[], skipped: [] as string[], pending: [] as string[], failed: [] as string[] };
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      if (Date.now() - started > budgetMs) { out.pending.push(item.key); continue; }
      try {
        const outcome = await ensureDisplayVariant(s3, bucketName, item.key, item.mimeType);
        (outcome === 'skipped' ? out.skipped : out.ready).push(item.key);
      } catch (error) {
        console.error(`[media-variants] could not make the copy of ${item.key}:`, error);
        out.failed.push(item.key);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return out;
}
