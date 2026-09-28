import { describe, expect, it } from 'bun:test';
import { cleanupSummary, runStorageCleanup, type CleanupPage, type CleanupRequest } from './storage-cleanup';

const page = (over: Partial<CleanupPage>): CleanupPage => ({ scanned: 0, inUse: 0, recent: 0, unused: 0, unusedBytes: 0, deleted: 0, next: null, ...over });

describe('runStorageCleanup', () => {
  it('walks every page of every area and adds them up', async () => {
    const seen: string[] = [];
    const request: CleanupRequest = async ({ prefix, after, remove, confirm }) => {
      seen.push(`${prefix}|${after}|${remove}|${confirm ?? ''}`);
      if (prefix === 'chat/' && after === null) return page({ scanned: 1000, inUse: 900, unused: 100, unusedBytes: 100, next: 'chat/k1000' });
      if (prefix === 'chat/') return page({ scanned: 10, inUse: 5, recent: 1, unused: 4, unusedBytes: 4 });
      return page({ scanned: 2, inUse: 2 });
    };
    const progress: number[] = [];
    const totals = await runStorageCleanup(request, { remove: false, onProgress: t => progress.push(t.scanned) });
    expect(seen).toEqual(['chat/|null|false|', 'chat/|chat/k1000|false|', 'posts/|null|false|', 'avatars/|null|false|']);
    expect(totals).toEqual({ scanned: 1014, inUse: 909, recent: 1, unused: 104, unusedBytes: 104, deleted: 0 });
    expect(progress).toEqual([1000, 1010, 1012, 1014]);
  });

  it('sends the confirmation only when deleting', async () => {
    const bodies: unknown[] = [];
    await runStorageCleanup(async body => { bodies.push(body); return page({}); }, { remove: true });
    expect(bodies).toEqual(['chat/', 'posts/', 'avatars/'].map(prefix => ({ prefix, after: null, remove: true, confirm: 'DELETE' })));
  });

  it('stops on the first failed page and never reports it as done', async () => {
    let calls = 0;
    const request: CleanupRequest = async ({ prefix }) => {
      calls++;
      if (prefix === 'posts/') throw new Error('Storage clean-up is temporarily unavailable. Please try again.');
      return page({ scanned: 1, unused: 1, deleted: 1 });
    };
    await expect(runStorageCleanup(request, { remove: true })).rejects.toThrow(/temporarily unavailable/);
    expect(calls).toBe(2);
  });

  it('refuses to loop when the server repeats the same position', async () => {
    await expect(runStorageCleanup(async () => page({ scanned: 1, next: 'chat/x' }), { remove: false })).rejects.toThrow(/stopped making progress/);
  });
});

describe('cleanupSummary', () => {
  it('says plainly what a check found and what a delete did', () => {
    expect(cleanupSummary({ scanned: 3, inUse: 3, recent: 0, unused: 0, unusedBytes: 0, deleted: 0 }, false))
      .toBe('Nothing to clean up: all 3 files are in use.');
    expect(cleanupSummary({ scanned: 12, inUse: 2, recent: 1, unused: 9, unusedBytes: 5 * 1024 * 1024, deleted: 0 }, false))
      .toBe('9 files (5.0 MB) are not used by any message, post or profile. 2 files are in use and will be kept. 1 file from the last hour was left alone.');
    expect(cleanupSummary({ scanned: 1500, inUse: 1, recent: 0, unused: 1499, unusedBytes: 20 * 1024 * 1024, deleted: 1499 }, true))
      .toBe('Deleted 1,499 files (20 MB) that nothing used. 1 file still in use was kept.');
  });
});
