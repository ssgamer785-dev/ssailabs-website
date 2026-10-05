import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { stripJpeg, stripPng, stripWebp, withoutMetadata } from './strip-metadata';

const NAME = 'Priya Sharma';
const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text));
const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${NAME}</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`;
const EXIF = { IFD0: { Artist: NAME, Copyright: NAME, Make: 'Phone', Model: 'Phone 15' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '28/1 36/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 12/1 0/1' } };

/** A small photo-like picture: gradients, so the bytes are not trivial. */
const base = (width = 96, height = 64) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    raw[i] = (x * 255) / width; raw[i + 1] = (y * 255) / height; raw[i + 2] = (x * y) % 256;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
};
/** Decoded pixels exactly as stored (no turning), to prove nothing was re-encoded. */
const pixels = (bytes: Uint8Array) => sharp(Buffer.from(bytes)).raw().toBuffer();

/** A JPEG comment segment, placed right after SOI. */
function withComment(jpeg: Uint8Array, text: string): Uint8Array {
  const body = Buffer.from(text);
  const segment = Buffer.concat([Buffer.from([0xff, 0xfe, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  return new Uint8Array(Buffer.concat([Buffer.from(jpeg.subarray(0, 2)), segment, Buffer.from(jpeg.subarray(2))]));
}

/** A PNG chunk with its CRC (computed by Bun, independently of the code under test). */
function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(Bun.hash.crc32(Buffer.concat([head.subarray(4), Buffer.from(data)])) >>> 0, 0);
  return Buffer.concat([head, Buffer.from(data), crc]);
}
/** Inserts chunks right after IHDR. */
function withPngChunks(png: Uint8Array, chunks: Buffer[]): Uint8Array {
  const ihdrEnd = 8 + 12 + new DataView(png.buffer, png.byteOffset).getUint32(8);
  return new Uint8Array(Buffer.concat([Buffer.from(png.subarray(0, ihdrEnd)), ...chunks, Buffer.from(png.subarray(ihdrEnd))]));
}
function pngChunks(png: Uint8Array): { type: string; crcOk: boolean }[] {
  const out: { type: string; crcOk: boolean }[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at + 12 <= png.length;) {
    const length = view.getUint32(at);
    const type = Buffer.from(png.subarray(at + 4, at + 8)).toString('latin1');
    const crc = view.getUint32(at + 8 + length);
    out.push({ type, crcOk: (Bun.hash.crc32(png.subarray(at + 4, at + 8 + length)) >>> 0) === crc });
    at += 12 + length;
  }
  return out;
}

describe('JPEG: who took it and where is removed; the picture is untouched', () => {
  it('drops EXIF (names, camera, GPS), XMP, comments and trailers; keeps the colour profile and the upright orientation', async () => {
    const made = new Uint8Array(await base().jpeg({ quality: 90 }).withExif(EXIF).withXmp(XMP).withIccProfile('p3').withMetadata({ orientation: 6 }).toBuffer());
    const original = new Uint8Array(Buffer.concat([Buffer.from(withComment(made, `Shot by ${NAME}`)), Buffer.from(`SEFT ${NAME} trailer`)]));
    const before = await sharp(Buffer.from(original)).metadata();
    expect([before.orientation, !!before.xmp, !!before.icc]).toEqual([6, true, true]);
    expect(has(original, NAME)).toBe(true);

    const out = stripJpeg(original)!;
    expect(has(out, NAME)).toBe(false);
    expect(has(out, 'Phone 15')).toBe(false);
    expect(has(out, 'SEFT')).toBe(false);
    const after = await sharp(Buffer.from(out)).metadata();
    expect(after.orientation).toBe(6);
    expect(after.xmp).toBeUndefined();
    expect(after.icc?.length).toBe(before.icc?.length);
    expect(after.exif!.length).toBeLessThan(40); // the orientation, and nothing else
    expect(after.comments ?? []).toEqual([]);
    // Lossless: the same pixels, and the same picture once turned upright.
    expect((await pixels(out)).equals(await pixels(original))).toBe(true);
    expect(after.width).toBe(before.width);
  });

  it('a photo that is already upright gets no EXIF block at all', async () => {
    const original = new Uint8Array(await base().jpeg().withExif(EXIF).toBuffer());
    const out = stripJpeg(original)!;
    expect((await sharp(Buffer.from(out)).metadata()).exif).toBeUndefined();
    expect((await pixels(out)).equals(await pixels(original))).toBe(true);
  });

  it('progressive JPEGs (many scans) come through whole', async () => {
    const original = new Uint8Array(await base(240, 160).jpeg({ progressive: true }).withExif(EXIF).toBuffer());
    const out = stripJpeg(original)!;
    expect(has(out, NAME)).toBe(false);
    expect((await pixels(out)).equals(await pixels(original))).toBe(true);
  });

  it('anything that is not a whole JPEG is left alone', () => {
    expect(stripJpeg(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(stripJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toBeNull();
  });
});

describe('PNG and WebP', () => {
  it('PNG: text, time, EXIF and unknown private chunks go; transparency and colour stay; every CRC is right', async () => {
    const png = new Uint8Array(await base().ensureAlpha(0.5).png().withIccProfile('p3').toBuffer());
    const exif = new Uint8Array(await base(4, 4).jpeg().withExif(EXIF).withMetadata({ orientation: 3 }).toBuffer());
    // The TIFF block out of that JPEG's EXIF, as a PNG eXIf chunk carries it.
    const tiff = (await sharp(Buffer.from(exif)).metadata()).exif!.subarray(6);
    const original = withPngChunks(png, [
      chunk('tEXt', Buffer.from(`Author\0${NAME}`)), chunk('iTXt', Buffer.from(`Description\0\0\0\0\0Taken at home by ${NAME}`)),
      chunk('tIME', new Uint8Array([7, 234, 10, 4, 12, 0, 0])), chunk('eXIf', tiff), chunk('caBX', Buffer.from(`credential ${NAME}`)),
    ]);
    expect(has(original, NAME)).toBe(true);
    const out = stripPng(original)!;
    expect(has(out, NAME)).toBe(false);
    const types = pngChunks(out);
    expect(types.every(c => c.crcOk)).toBe(true);
    expect(types.map(c => c.type).filter(t => !['IDAT'].includes(t))).toEqual(['IHDR', 'eXIf', 'iCCP', 'pHYs', 'IEND']);
    const after = await sharp(Buffer.from(out)).metadata();
    expect([after.hasAlpha, !!after.icc, after.orientation]).toEqual([true, true, 3]);
    expect((await pixels(out)).equals(await pixels(original))).toBe(true);
  });

  it('WebP: EXIF and XMP go, the header says so, the picture decodes the same', async () => {
    const original = new Uint8Array(await base().webp({ quality: 80 }).withExif(EXIF).withXmp(XMP).toBuffer());
    expect(has(original, NAME)).toBe(true);
    const out = stripWebp(original)!;
    expect(has(out, NAME)).toBe(false);
    const after = await sharp(Buffer.from(out)).metadata();
    expect([after.exif, after.xmp]).toEqual([undefined, undefined]);
    expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.length - 8);
    expect((await pixels(out)).equals(await pixels(original))).toBe(true);
  });

  it('a WebP turned on its side keeps only its orientation', async () => {
    const original = new Uint8Array(await base().webp().withExif(EXIF).withMetadata({ orientation: 8 }).toBuffer());
    const out = stripWebp(original)!;
    expect(has(out, NAME)).toBe(false);
    expect((await sharp(Buffer.from(out)).metadata()).orientation).toBe(8);
  });
});

describe('before upload', () => {
  it('gives back a clean file with the same name and type; leaves GIFs and broken files as they are', async () => {
    const jpeg = new File([await base().jpeg().withExif(EXIF).toBuffer()], 'IMG_2041.jpg', { type: 'image/jpeg', lastModified: 5 });
    const clean = await withoutMetadata(jpeg);
    expect([clean.name, clean.type, clean.lastModified]).toEqual(['IMG_2041.jpg', 'image/jpeg', 5]);
    expect(has(new Uint8Array(await clean.arrayBuffer()), NAME)).toBe(false);
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'a.gif', { type: 'image/gif' });
    expect(await withoutMetadata(gif)).toBe(gif);
    const broken = new File([new Uint8Array([0xff, 0xd8, 1, 2])], 'b.jpg', { type: 'image/jpeg' });
    expect(await withoutMetadata(broken)).toBe(broken);
    // Nothing to remove: the very same file.
    const plain = new File([await base().png().toBuffer()], 'c.png', { type: 'image/png' });
    expect(await withoutMetadata(plain)).toBe(plain);
  });
});
