/**
 * Apple's HEIC photos display only on Apple devices: an iPhone photo sent as
 * HEIC shows as a broken image on Android, Chrome and Windows (TP-053). Where
 * this browser can decode HEIC (Safari on iPhone and Mac), the photo is
 * re-encoded as JPEG before upload so every member can see it; where it
 * cannot, the member is told plainly instead of sending a photo others can't
 * open.
 */
export const HEIC_UNSUPPORTED_MESSAGE =
  "This photo is in Apple's HEIC format, which other phones cannot show. Choose it again from your iPhone, or pick a JPEG or PNG.";

export class PortableImageError extends Error {
  constructor() { super(HEIC_UNSUPPORTED_MESSAGE); this.name = 'PortableImageError'; }
}

export function isHeic(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

type Codec = {
  decode: (file: Blob) => Promise<{ width: number; height: number; draw: (context: CanvasRenderingContext2D) => void; close: () => void }>;
  encode: (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => Promise<Blob | null>;
};

const browserCodec: Codec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, draw: context => context.drawImage(bitmap, 0, 0), close: () => bitmap.close() };
  },
  encode(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    draw(context);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  },
};

/** The file unchanged unless it is HEIC; a JPEG copy when it is. Throws PortableImageError if it cannot be converted. */
export async function toPortableImage(file: File, codec: Codec = browserCodec): Promise<File> {
  if (!isHeic(file)) return file;
  let image: Awaited<ReturnType<Codec['decode']>>;
  try { image = await codec.decode(file); } catch { throw new PortableImageError(); }
  try {
    const jpeg = await codec.encode(image.width, image.height, image.draw);
    if (!jpeg || !jpeg.size) throw new PortableImageError();
    const name = `${file.name.replace(/\.hei[cf]$/i, '') || 'photo'}.jpg`;
    return new File([jpeg], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    image.close();
  }
}
