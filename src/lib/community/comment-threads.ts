/**
 * Comments as one-level threads (RC5). The database already keeps every reply
 * one level deep — parentId is always the thread's top-level comment — so this
 * only groups and orders what arrived. Pure, so the ordering rules are tested
 * directly.
 */
export interface ThreadedLike {
  id: string;
  createdAt: string;
  /** The thread's top-level comment; null/undefined for a top-level comment. */
  parentId?: string | null;
  pending?: boolean;
  failed?: boolean;
}

export interface Thread<T> { root: T; replies: T[] }

const byTimeAsc = <T extends ThreadedLike>(a: T, b: T) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

/**
 * Top-level comments newest first, each with its replies oldest first (the
 * order a conversation is read in). A reply whose thread is not loaded — its
 * comment was deleted, or it arrived live for an older page — is shown as its
 * own entry rather than dropped.
 */
export function threadComments<T extends ThreadedLike>(comments: T[]): Thread<T>[] {
  const ids = new Set(comments.map(c => c.id));
  const roots = comments.filter(c => !c.parentId || !ids.has(c.parentId));
  const replies = new Map<string, T[]>();
  for (const c of comments) {
    if (c.parentId && ids.has(c.parentId)) {
      const list = replies.get(c.parentId) ?? [];
      list.push(c);
      replies.set(c.parentId, list);
    }
  }
  return roots
    .sort((a, b) => -byTimeAsc(a, b))
    .map(root => ({ root, replies: (replies.get(root.id) ?? []).sort(byTimeAsc) }));
}

/**
 * Folds a freshly fetched first page of THREADS into what is on screen. The
 * page is bounded by its oldest top-level comment: anything newer belongs to
 * the fresh page, older threads the reader already loaded are kept with their
 * replies, and comments still being sent stay.
 */
export function mergeThreadPage<T extends ThreadedLike>(previous: T[], fresh: T[]): T[] {
  const freshIds = new Set(fresh.map(c => c.id));
  const freshRoots = fresh.filter(c => !c.parentId);
  const cutoff = freshRoots.length ? freshRoots.map(c => c.createdAt).sort()[0] : null;
  if (cutoff === null) return previous.filter(c => c.pending || c.failed);
  const keptRoots = new Set(previous
    .filter(c => !c.parentId && !c.pending && !c.failed && !freshIds.has(c.id) && c.createdAt < cutoff)
    .map(c => c.id));
  const older = previous.filter(c => !freshIds.has(c.id) && !c.pending && !c.failed
    && (keptRoots.has(c.id) || (c.parentId != null && keptRoots.has(c.parentId))));
  const inFlight = previous.filter(c => c.pending || c.failed);
  return [...fresh, ...older, ...inFlight];
}
