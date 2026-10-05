import { afterEach, describe, expect, test } from 'bun:test';
import { displayCopiesOffered, ensureDisplayVariant, imageLibraryCheck, setImageLibraryLoaderForTests } from './media-variants';

afterEach(() => setImageLibraryLoaderForTests(null));

describe('display copies where the image library does not load', () => {
  test('no copy is offered once that is known, the deployment check says so, and making one fails cleanly', async () => {
    // A deployment whose native image binary is missing.
    setImageLibraryLoaderForTests(() => Promise.reject(new Error('Could not load the "sharp" module using the linux-x64 runtime')));
    const quiet = console.error; console.error = () => {};
    try {
      // The first ask starts loading the library; until it has failed, a copy may still be offered.
      displayCopiesOffered();
      expect((await imageLibraryCheck()).ok).toBe(false);
      expect(displayCopiesOffered()).toBe(false);
      const s3 = { send: async () => { throw Object.assign(new Error('NotFound'), { name: 'NotFound' }); } };
      await expect(ensureDisplayVariant(s3 as never, 'bucket', 'posts/a/b.bin', 'image/jpeg')).rejects.toThrow(/unavailable/);
    } finally {
      console.error = quiet;
    }
  });

  test('with the library present, copies are offered and the check passes', async () => {
    expect(displayCopiesOffered()).toBe(true);
    expect((await imageLibraryCheck()).ok).toBe(true);
    expect(displayCopiesOffered()).toBe(true);
  });
});
