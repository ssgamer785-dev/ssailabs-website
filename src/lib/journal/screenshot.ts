/**
 * A chart screenshot as it is uploaded. Within the 10 MB limit the picture is
 * sent exactly as chosen (the app's usual HEIC→JPEG and metadata stripping
 * happen before this). Above it, rather than refusing a long or high-resolution
 * capture, it is re-encoded as a JPEG at the same proportions — never cropped —
 * with the quality lowered, and the size reduced, only as far as needed.
 */
import { SCREENSHOT_MAX_BYTES } from './model';

/** Safari on iPhone draws nothing on a canvas above ~16.7 million pixels. */
export const MAX_CANVAS_PIXELS = 16_777_216;

export interface Decoded { width: number; height: number; draw: (context: CanvasRenderingContext2D, width: number, height: number) => void; close: () => void }
export interface ScreenshotCodec {
  decode: (file: Blob) => Promise<Decoded>;
  encode: (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void, quality: number) => Promise<Blob | null>;
}

export class ScreenshotTooLargeError extends Error {
  constructor() { super('That picture is too large to upload, even after optimising it. Try a smaller screenshot.'); this.name = 'ScreenshotTooLargeError'; }
}

const browserCodec: ScreenshotCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, draw: (context, w, h) => context.drawImage(bitmap, 0, 0, w, h), close: () => bitmap.close() };
  },
  encode(width, height, draw, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    draw(context);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  },
};

/** The attempts, gentlest first: [share of the (canvas-safe) size, JPEG quality]. */
const STEPS: [number, number][] = [[1, 0.92], [1, 0.85], [0.85, 0.85], [0.7, 0.82], [0.55, 0.8], [0.4, 0.78]];

export async function fitScreenshot(file: File, codec: ScreenshotCodec = browserCodec): Promise<{ file: File; optimised: boolean }> {
  if (file.size <= SCREENSHOT_MAX_BYTES) return { file, optimised: false };
  let image: Decoded;
  try { image = await codec.decode(file); } catch { throw new ScreenshotTooLargeError(); }
  try {
    const safe = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (image.width * image.height)));
    for (const [share, quality] of STEPS) {
      const scale = safe * share;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const blob = await codec.encode(width, height, context => {
        // A transparent PNG would turn black as a JPEG: charts sit on white.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        image.draw(context, width, height);
      }, quality);
      if (blob && blob.size > 0 && blob.size <= SCREENSHOT_MAX_BYTES) {
        const name = `${file.name.replace(/\.[^.]+$/, '') || 'screenshot'}.jpg`;
        return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), optimised: true };
      }
    }
    throw new ScreenshotTooLargeError();
  } finally {
    image.close();
  }
}

/**
 * How a picture of this shape sits in a frame: its own proportions, with very
 * tall or very wide pictures letterboxed (never cropped) inside a frame that
 * stays a sensible shape on a phone.
 */
export function previewRatio(width: number | null | undefined, height: number | null | undefined): number {
  if (!width || !height) return 16 / 10;
  return Math.min(2.4, Math.max(0.56, width / height));
}
