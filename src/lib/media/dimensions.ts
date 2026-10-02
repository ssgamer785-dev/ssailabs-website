/**
 * A picture's own width and height, read on the sender's device so every
 * viewer can reserve exactly the right space before the picture loads (no
 * jump in the feed, and the right shape for the grey placeholder).
 * Display hints only: a failure is simply "unknown".
 */
export interface MediaSize { width: number; height: number }

const MAX = 20000;

export function sane(size: Partial<MediaSize> | null | undefined): MediaSize | null {
  const width = Math.round(size?.width ?? 0);
  const height = Math.round(size?.height ?? 0);
  return width >= 1 && height >= 1 && width <= MAX && height <= MAX ? { width, height } : null;
}

export async function measureImage(file: Blob): Promise<MediaSize | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const size = sane({ width: bitmap.width, height: bitmap.height });
      bitmap.close?.();
      return size;
    }
  } catch { /* fall through to an <img> */ }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<MediaSize | null>(resolve => {
      const img = new Image();
      img.onload = () => resolve(sane({ width: img.naturalWidth, height: img.naturalHeight }));
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The CSS aspect ratio a single picture should take in a feed: its own shape,
 * kept within portrait 4:5 and landscape 1.91:1 like other feeds, so one
 * very tall or very wide picture cannot take over the screen.
 */
export function feedAspectRatio(size: MediaSize | null): number {
  if (!size) return 4 / 3;
  const ratio = size.width / size.height;
  return Math.min(1.91, Math.max(0.8, ratio));
}
