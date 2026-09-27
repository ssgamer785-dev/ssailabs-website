interface CommentLike { id: string; createdAt: string; pending?: boolean; failed?: boolean }

/**
 * Folds a freshly fetched first page into what is already on screen.
 *
 * Any new comment used to replace the whole list with page 1, so a reader who
 * had loaded older comments lost their place (TP-035). The fresh page wins for
 * everything it covers; older loaded comments are kept after it; comments
 * still being sent stay at the end so they do not vanish mid-send.
 */
export function mergeFirstPage<T extends CommentLike>(previous: T[], fresh: T[]): T[] {
  const freshIds = new Set(fresh.map(c => c.id));
  const cutoff = fresh.length ? fresh[fresh.length - 1].createdAt : null;
  const older = previous.filter(c => !c.pending && !c.failed && !freshIds.has(c.id)
    && cutoff !== null && c.createdAt < cutoff);
  const inFlight = previous.filter(c => c.pending || c.failed);
  return [...fresh, ...older, ...inFlight];
}
