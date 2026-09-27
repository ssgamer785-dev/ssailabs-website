/**
 * Merging server rows into the list a chat screen is already showing.
 *
 * Pure and side-effect free so the reconciliation rules can be tested
 * directly — they are what stops an optimistic bubble and its Realtime echo
 * from appearing as two messages.
 *
 * The identity rule: a message is the same message if it shares a client_id
 * (our own send, coming back) or a row id (anyone's row, arriving twice).
 * A client_id is generated per send and stored on the row, so a retry of the
 * same send collides in the database rather than inserting a second copy.
 */

import type { ChatMessage } from './types';

export function sortByTime(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    // Ties broken on the stable client id, so ordering never flickers between
    // two messages written in the same millisecond.
    return d !== 0 ? d : a.clientId.localeCompare(b.clientId);
  });
}

/**
 * Merges a confirmed row in, replacing its optimistic twin if one is present.
 *
 * The local-only fields (preview URLs, the blob held for retry, live upload
 * progress) survive the merge: a Realtime echo of our own row must not blank
 * out the picture the sender is already looking at, or lose what a retry needs.
 */
export function upsertMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = list.findIndex(m => m.clientId === incoming.clientId || m.id === incoming.id);
  if (idx === -1) return sortByTime([...list, incoming]);

  const existing = list[idx];
  const next = [...list];
  next[idx] = {
    ...incoming,
    localPreviewUrl: existing.localPreviewUrl,
    localPosterUrl: existing.localPosterUrl,
    pendingFile: existing.pendingFile,
    pendingPoster: existing.pendingPoster,
    // A row that is still uploading keeps its in-progress bubble state; the
    // server row only says 'pending', it knows nothing about the percentage.
    status: incoming.uploadStatus === 'pending' && existing.status !== 'sent'
      ? existing.status
      : incoming.status,
    progress: existing.progress,
    error: existing.error,
  };
  return sortByTime(next);
}
