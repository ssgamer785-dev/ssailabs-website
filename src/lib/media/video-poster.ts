/**
 * Pulls a still frame and the duration out of a video file, in the browser.
 *
 * Why bother: a chat thread or a community feed should not have to download
 * video bytes just to show something. Uploading a small JPEG alongside the
 * video means a bubble or a post card can render its thumbnail immediately and
 * fetch the video itself only when someone actually taps play.
 *
 * Best effort by design. Some codecs and some iOS versions refuse to give up a
 * frame to canvas, so every caller must cope with null — the UI then falls back
 * to a plain placeholder, which is a cosmetic loss and nothing more.
 */

export interface VideoPoster {
  blob: Blob;
  width: number;
  height: number;
}

export interface VideoProbe {
  durationSeconds: number | null;
  poster: VideoPoster | null;
}

/** Give up rather than hold a send hostage to a file the decoder dislikes. */
const TIMEOUT_MS = 6000;
/** Big enough to look sharp on a 3x phone circle, small enough to be free. */
const MAX_EDGE = 480;
const JPEG_QUALITY = 0.72;

function loadVideo(objectUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    // Both are required for iOS to decode without going fullscreen.
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const done = () => resolve(video);
    video.onloadedmetadata = done;
    video.onerror = () => reject(new Error('Could not read this video.'));
  });
}

/** Seeks to `time` and resolves once a frame for it is actually decoded. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise(resolve => {
    const settle = () => resolve();
    video.onseeked = settle;
    try {
      video.currentTime = time;
    } catch {
      // Some browsers throw if the video isn't seekable yet; the frame at 0
      // is still usually drawable, so carry on rather than fail the upload.
      settle();
    }
  });
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Reads a video's duration and grabs a poster frame.
 *
 * Never throws: on any failure the caller still gets an object, just with
 * nulls in it, so a video can always be sent even when no thumbnail is
 * possible.
 */
export async function probeVideo(file: Blob): Promise<VideoProbe> {
  if (typeof document === 'undefined') return { durationSeconds: null, poster: null };

  const objectUrl = URL.createObjectURL(file);
  try {
    const result = await withTimeout(extract(objectUrl), TIMEOUT_MS);
    return result ?? { durationSeconds: null, poster: null };
  } catch {
    return { durationSeconds: null, poster: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function extract(objectUrl: string): Promise<VideoProbe> {
  const video = await loadVideo(objectUrl);

  const duration = Number.isFinite(video.duration) && video.duration > 0
    ? Math.round(video.duration)
    : null;

  // A hair past the start: frame zero of a phone recording is often black.
  const target = duration && duration > 1 ? Math.min(0.6, duration / 2) : 0;
  await seekTo(video, target);

  const poster = drawPoster(video);
  video.src = '';
  return { durationSeconds: duration, poster };
}

function drawPoster(video: HTMLVideoElement): VideoPoster | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, width, height);
  } catch {
    // Tainted or undecodable frame — no poster, but the video itself is fine.
    return null;
  }

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const blob = dataUrlToBlob(dataUrl);
  return blob ? { blob, width, height } : null;
}

/**
 * canvas.toBlob is callback-based and, on some older WebKit builds, silently
 * never fires. toDataURL is synchronous and always returns, so the conversion
 * happens here instead.
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.startsWith('data:image/jpeg;base64,')) return null;

  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}
