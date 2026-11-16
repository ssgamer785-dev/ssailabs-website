import { describe, expect, it } from 'bun:test';
import { SCREENSHOT_MAX_BYTES } from './model';
import { MAX_CANVAS_PIXELS, ScreenshotTooLargeError, fitScreenshot, previewRatio, type ScreenshotCodec } from './screenshot';

/** A codec whose output size follows pixels x quality, recording what it was asked to draw. */
function fakeCodec(width: number, height: number, bytesPerPixel: number) {
  const calls: { width: number; height: number; quality: number; drewAt?: [number, number]; filled: boolean }[] = [];
  let closed = false;
  const codec: ScreenshotCodec = {
    decode: async () => ({ width, height, draw: (ctx, w, h) => { (ctx as unknown as { drewAt: [number, number] }).drewAt = [w, h]; }, close: () => { closed = true; } }),
    encode: async (w, h, draw, quality) => {
      const ctx = { fillStyle: '', fillRect: () => { ctx.filled = true; }, filled: false, drewAt: undefined as [number, number] | undefined };
      draw(ctx as unknown as CanvasRenderingContext2D);
      calls.push({ width: w, height: h, quality, drewAt: ctx.drewAt, filled: ctx.filled });
      const size = Math.round(w * h * bytesPerPixel * quality);
      // Only a result that fits becomes real bytes; a too-large one is just its size (no huge allocations in a test).
      return size > SCREENSHOT_MAX_BYTES ? ({ size } as Blob) : new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
    },
  };
  return { codec, calls, closed: () => closed };
}
const file = (bytes: number, name = "chart.png", type = "image/png") => { const f = new File([new Uint8Array(1)], name, { type }); Object.defineProperty(f, "size", { value: bytes }); return f; };

describe('fitScreenshot', () => {
  it('sends a picture within the limit exactly as chosen', async () => {
    const original = file(SCREENSHOT_MAX_BYTES);
    const { codec, calls } = fakeCodec(1000, 1000, 1);
    const out = await fitScreenshot(original, codec);
    expect(out.optimised).toBe(false);
    expect(out.file).toBe(original);
    expect(calls.length).toBe(0);
  });

  it('re-encodes a larger one as a JPEG at the same proportions, gentlest step first', async () => {
    const { codec, calls, closed } = fakeCodec(2400, 1600, 3); // 2400x1600 x3 x0.92 = 10.6 MB > 10 MB; x0.85 = 9.8 MB fits
    const out = await fitScreenshot(file(SCREENSHOT_MAX_BYTES + 1), codec);
    expect(out.optimised).toBe(true);
    expect(out.file.type).toBe('image/jpeg');
    expect(out.file.name).toBe('chart.jpg');
    expect(out.file.size).toBeLessThanOrEqual(SCREENSHOT_MAX_BYTES);
    expect(calls.map(c => [c.width, c.height, c.quality])).toEqual([[2400, 1600, 0.92], [2400, 1600, 0.85]]);
    expect(calls.every(c => c.filled && c.drewAt?.[0] === c.width && c.drewAt?.[1] === c.height)).toBe(true);
    expect(closed()).toBe(true);
  });

  it('a very tall capture keeps its proportions and stays within what an iPhone can draw', async () => {
    const { codec, calls } = fakeCodec(1290, 20000, 1);
    const out = await fitScreenshot(file(SCREENSHOT_MAX_BYTES * 2), codec);
    expect(out.optimised).toBe(true);
    const first = calls[0];
    expect(first.width * first.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(Math.abs(first.width / first.height - 1290 / 20000)).toBeLessThan(0.002);
  });

  it('says so plainly when nothing fits, and when the picture cannot be read', async () => {
    const huge = fakeCodec(4000, 4000, 40);
    await expect(fitScreenshot(file(SCREENSHOT_MAX_BYTES * 3), huge.codec)).rejects.toBeInstanceOf(ScreenshotTooLargeError);
    expect(huge.closed()).toBe(true);
    const broken: ScreenshotCodec = { decode: async () => { throw new Error('no'); }, encode: async () => null };
    await expect(fitScreenshot(file(SCREENSHOT_MAX_BYTES * 2), broken)).rejects.toBeInstanceOf(ScreenshotTooLargeError);
  });
});

describe('previewRatio', () => {
  it('uses the picture’s own shape, letterboxing extremes instead of cropping', () => {
    expect(previewRatio(1600, 900)).toBeCloseTo(16 / 9);
    expect(previewRatio(1000, 1000)).toBe(1);
    expect(previewRatio(1290, 12000)).toBe(0.56);
    expect(previewRatio(5120, 1440)).toBe(2.4);
    expect(previewRatio(null, 900)).toBe(1.6);
  });
});
