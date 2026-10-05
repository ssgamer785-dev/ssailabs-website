/**
 * Removes what a photo says about the person who took it — the camera, the
 * GPS position, names and copyright lines, editing history, comments — before
 * it leaves the phone. Nothing is re-encoded: the picture itself is the same,
 * byte for byte. What a picture needs to look right is kept: a JPEG's upright
 * orientation (as a minimal EXIF block holding only that), colour profiles,
 * and transparency and animation in PNG and WebP. Anything this cannot read
 * as a well-formed JPEG, PNG or WebP is returned unchanged.
 */

/** JPEG segments kept as they are: everything else before the image data is metadata. */
const JPEG_APP0 = 0xe0;
const JPEG_APP1 = 0xe1;
const JPEG_APP2 = 0xe2;
const JPEG_APP14 = 0xee;
const JPEG_COM = 0xfe;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));

/** The EXIF orientation (1–8) in a TIFF structure, or null when there is none. */
function tiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, little) !== 0x2a) return null;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.length) return null;
    if (view.getUint16(at, little) === 0x0112) {
      const value = view.getUint16(at + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A TIFF structure holding nothing but an orientation. */
function orientationTiff(orientation: number): Uint8Array {
  return new Uint8Array([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian, first directory at 8
    0x00, 0x01,                                     // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1 value
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,                         // no further directory
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** A JPEG without its metadata; null when it is not one this can read. */
export function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let afterJfif = 1; // where a new EXIF block goes: right after SOI, or after APP0
  let at = 2;
  let scanning = false;
  while (at < bytes.length) {
    if (scanning) {
      // Entropy-coded data: runs to the next marker that is neither a stuffed 0xFF nor a restart marker.
      const start = at;
      while (at + 1 < bytes.length && !(bytes[at] === 0xff && bytes[at + 1] !== 0x00 && !(bytes[at + 1] >= 0xd0 && bytes[at + 1] <= 0xd7))) at++;
      if (at + 1 >= bytes.length) return null;
      kept.push(bytes.subarray(start, at));
      scanning = false;
      continue;
    }
    if (bytes[at] !== 0xff) return null;
    // Fill bytes before a marker.
    while (at + 1 < bytes.length && bytes[at + 1] === 0xff) at++;
    if (at + 1 >= bytes.length) return null;
    const marker = bytes[at + 1];
    if (marker === JPEG_EOI) {
      kept.push(bytes.subarray(at, at + 2));
      // Anything after the image (a second picture, a phone maker's trailer, a motion clip) is dropped.
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) { kept.push(bytes.subarray(at, at + 2)); at += 2; continue; }
    if (at + 4 > bytes.length) return null;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2 || at + 2 + length > bytes.length) return null;
    const segment = bytes.subarray(at, at + 2 + length);
    const payload = bytes.subarray(at + 4, at + 2 + length);
    let keep = true;
    if (marker === JPEG_APP1) {
      if (ascii(payload, 0, 6) === 'Exif\0\0') orientation ??= tiffOrientation(payload.subarray(6));
      keep = false;
    } else if (marker === JPEG_APP2) {
      keep = ascii(payload, 0, 12) === 'ICC_PROFILE\0';
    } else if (marker === JPEG_APP0 || marker === JPEG_APP14) {
      keep = true;
    } else if ((marker >= 0xe3 && marker <= 0xef) || marker === JPEG_COM) {
      keep = false;
    }
    if (keep) {
      kept.push(segment);
      if (marker === JPEG_APP0 && kept.length === 2) afterJfif = 2;
    }
    at += 2 + length;
    if (marker === JPEG_SOS) scanning = true;
  }
  if (kept[kept.length - 1]?.[1] !== JPEG_EOI) return null;
  if (orientation && orientation !== 1) {
    const tiff = orientationTiff(orientation);
    const header = new Uint8Array([0xff, JPEG_APP1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0]);
    const length = 2 + 6 + tiff.length;
    header[2] = length >> 8; header[3] = length & 0xff;
    kept.splice(afterJfif, 0, concat([header, tiff]));
  }
  return concat(kept);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Ancillary PNG chunks that change how the picture looks (or moves): kept. Text, time and EXIF chunks are not. */
const PNG_KEPT = new Set(['tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV', 'cLLI', 'bKGD', 'hIST', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT']);

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A PNG without its metadata; null when it is not one this can read. */
export function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  let ended = false;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const critical = type.charCodeAt(0) < 0x61; // an upper-case first letter
    if (type === 'eXIf') {
      // Only an orientation survives, as a minimal block.
      const orientation = tiffOrientation(bytes.subarray(at + 8, at + 8 + length));
      if (orientation && orientation !== 1) {
        const tiff = orientationTiff(orientation);
        const chunk = new Uint8Array(12 + tiff.length);
        const out = new DataView(chunk.buffer);
        out.setUint32(0, tiff.length);
        chunk.set([0x65, 0x58, 0x49, 0x66], 4);
        chunk.set(tiff, 8);
        out.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
        kept.push(chunk);
      }
    } else if (critical || PNG_KEPT.has(type)) {
      kept.push(bytes.subarray(at, end));
    }
    at = end;
    if (type === 'IEND') { ended = true; break; }
  }
  return ended ? concat(kept) : null;
}

/** A WebP without its metadata (only an orientation survives); null when it is not one this can read. */
export function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd > bytes.length) return null;
  const kept: Uint8Array[] = [];
  let at = 12;
  let removed = false;
  let keptExif = false;
  while (at + 8 <= riffEnd) {
    const type = ascii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size & 1);
    if (end > riffEnd) return null;
    if (type === 'EXIF') {
      removed = true;
      const payload = bytes.subarray(at + 8, at + 8 + size);
      const orientation = tiffOrientation(ascii(payload, 0, 6) === 'Exif\0\0' ? payload.subarray(6) : payload);
      if (orientation && orientation !== 1) {
        const tiff = orientationTiff(orientation);
        const chunk = new Uint8Array(8 + tiff.length);
        chunk.set([0x45, 0x58, 0x49, 0x46]);
        new DataView(chunk.buffer).setUint32(4, tiff.length, true);
        chunk.set(tiff, 8);
        kept.push(chunk);
        keptExif = true;
      }
    } else if (type === 'XMP ') {
      removed = true;
    } else {
      kept.push(bytes.slice(at, end));
    }
    at = end;
  }
  if (!removed) return bytes;
  // The extended header says which chunks follow: XMP no longer does, and EXIF only when an orientation is kept.
  const header = kept.find(chunk => ascii(chunk, 0, 4) === 'VP8X');
  if (header && header.length > 8) header[8] &= ~(0x04 | (keptExif ? 0 : 0x08));
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

/** The same picture without its metadata (JPEG, PNG, WebP); anything else, or anything malformed, unchanged. */
export async function withoutMetadata(file: File): Promise<File> {
  const strip = /^image\/jpe?g$/i.test(file.type) ? stripJpeg : /^image\/png$/i.test(file.type) ? stripPng
    : /^image\/webp$/i.test(file.type) ? stripWebp : null;
  if (!strip) return file;
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { return file; }
  let out: Uint8Array | null = null;
  try { out = strip(bytes); } catch { out = null; }
  if (!out || out === bytes || out.length === bytes.length && out.every((b, i) => b === bytes[i])) return file;
  return new File([out], file.name, { type: file.type, lastModified: file.lastModified });
}
