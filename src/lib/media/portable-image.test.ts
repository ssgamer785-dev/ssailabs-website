import { describe, expect, it } from 'bun:test';
import { HEIC_UNSUPPORTED_MESSAGE, isHeic, toPortableImage } from './portable-image';

const codec = (decodes: boolean) => ({
  decode: async () => { if (!decodes) throw new Error('no HEIC decoder'); return { width: 4, height: 3, draw: () => {}, close: () => {} }; },
  encode: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
});

describe('portable images', () => {
  it('recognises HEIC by type or by name', () => {
    expect(isHeic({ type: 'image/heic', name: 'IMG_1.HEIC' })).toBe(true);
    expect(isHeic({ type: '', name: 'IMG_2.heif' })).toBe(true);
    expect(isHeic({ type: 'image/jpeg', name: 'IMG_3.jpg' })).toBe(false);
  });
  it('leaves other images untouched', async () => {
    const jpeg = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' });
    expect(await toPortableImage(jpeg, codec(true))).toBe(jpeg);
  });
  it('turns a HEIC photo into a JPEG where the browser can read it', async () => {
    const heic = new File([new Uint8Array([1, 2])], 'IMG_0042.HEIC', { type: 'image/heic' });
    const out = await toPortableImage(heic, codec(true));
    expect([out.type, out.name]).toEqual(['image/jpeg', 'IMG_0042.jpg']);
  });
  it('explains plainly where it cannot', async () => {
    const heic = new File([new Uint8Array([1, 2])], 'IMG_0043.heic', { type: 'image/heic' });
    await expect(toPortableImage(heic, codec(false))).rejects.toThrow(HEIC_UNSUPPORTED_MESSAGE);
  });
});
