/**
 * The admin storage clean-up, client side: walks every page of every area the
 * server allows (chat, community posts, profile pictures) and adds up what it
 * found. Kept free of the Supabase client so the loop can be tested on its own;
 * the request itself is passed in.
 */
export const CLEANUP_AREAS = ['chat/', 'posts/', 'avatars/'] as const;
export const CLEANUP_CONFIRM_WORD = 'DELETE';

export interface CleanupPage {
  scanned: number;
  inUse: number;
  recent: number;
  unused: number;
  unusedBytes: number;
  deleted: number;
  next: string | null;
}

export interface CleanupTotals {
  scanned: number;
  inUse: number;
  recent: number;
  unused: number;
  unusedBytes: number;
  deleted: number;
}

export type CleanupRequest = (body: { prefix: string; after: string | null; remove: boolean; confirm?: string }) => Promise<CleanupPage>;

/** More pages than any real bucket of this app would need: a guard against a server that never finishes. */
const MAX_PAGES_PER_AREA = 10_000;

export function emptyTotals(): CleanupTotals {
  return { scanned: 0, inUse: 0, recent: 0, unused: 0, unusedBytes: 0, deleted: 0 };
}

export async function runStorageCleanup(
  request: CleanupRequest,
  options: { remove: boolean; onProgress?: (totals: CleanupTotals) => void },
): Promise<CleanupTotals> {
  const totals = emptyTotals();
  for (const prefix of CLEANUP_AREAS) {
    let after: string | null = null;
    for (let pages = 0; ; pages++) {
      if (pages >= MAX_PAGES_PER_AREA) throw new Error('The storage check did not finish. Try again.');
      const page = await request({ prefix, after, remove: options.remove, ...(options.remove ? { confirm: CLEANUP_CONFIRM_WORD } : {}) });
      totals.scanned += page.scanned;
      totals.inUse += page.inUse;
      totals.recent += page.recent;
      totals.unused += page.unused;
      totals.unusedBytes += page.unusedBytes;
      totals.deleted += page.deleted;
      options.onProgress?.({ ...totals });
      if (!page.next) break;
      if (page.next === after) throw new Error('The storage check stopped making progress. Try again.');
      after = page.next;
    }
  }
  return totals;
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

const files = (n: number) => `${n.toLocaleString('en-GB')} file${n === 1 ? '' : 's'}`;

/** Plain-language summary of a check or a delete. */
export function cleanupSummary(totals: CleanupTotals, removed: boolean): string {
  const recent = totals.recent ? ` ${files(totals.recent)} from the last hour ${totals.recent === 1 ? 'was' : 'were'} left alone.` : '';
  if (removed) {
    return `Deleted ${files(totals.deleted)} (${megabytes(totals.unusedBytes)}) that nothing used. ${files(totals.inUse)} still in use ${totals.inUse === 1 ? 'was' : 'were'} kept.${recent}`;
  }
  if (!totals.scanned) return 'No media files found. Nothing to clean up.';
  if (!totals.unused) {
    return `Nothing to clean up: all ${files(totals.inUse)} ${totals.inUse === 1 ? 'is' : 'are'} in use.${recent}`;
  }
  return `${files(totals.unused)} (${megabytes(totals.unusedBytes)}) ${totals.unused === 1 ? 'is' : 'are'} not used by any message, post or profile. ${files(totals.inUse)} ${totals.inUse === 1 ? 'is' : 'are'} in use and will be kept.${recent}`;
}
