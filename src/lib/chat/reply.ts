import { formatDuration, type ChatMessage } from './types';

/**
 * Replying to a chat message: what a quote says, and how a swipe is read.
 * Pure functions, so the gesture and the wording are testable without a DOM.
 */

/** One line of what the quoted message was. Never more than the original showed: a deleted one says only that. */
export function replySnippet(message: Pick<ChatMessage, 'kind' | 'body' | 'deletedAt' | 'fileName' | 'durationSeconds' | 'mediaPurged'>): string {
  if (message.deletedAt) return 'This message was deleted';
  switch (message.kind) {
    case 'text': {
      const line = (message.body ?? '').replace(/\s+/g, ' ').trim();
      if (!line) return 'Message';
      return line.length > 90 ? `${line.slice(0, 89)}…` : line;
    }
    case 'image': return message.mediaPurged ? 'Photo (removed)' : 'Photo';
    case 'video': return message.mediaPurged ? 'Video (removed)' : 'Video';
    case 'voice': return message.durationSeconds ? `Voice message · ${formatDuration(message.durationSeconds)}` : 'Voice message';
    case 'pdf':
    case 'file': return message.fileName ? `Document · ${message.fileName}` : 'Document';
    default: return 'Message';
  }
}

/** Who wrote the quoted message, as the viewer knows them. */
export function replySender(senderId: string, viewerId: string | null | undefined, viewerIsAdmin: boolean, peerName: string): string {
  if (senderId === viewerId) return 'You';
  return viewerIsAdmin ? peerName : 'Admin';
}

/** How far a message must be pulled to the right before letting go replies to it. */
export const SWIPE_TRIGGER_PX = 56;
/** Where the pull stops following the finger one to one. */
export const SWIPE_MAX_PX = 84;
/** Movement below this is a tap, not a swipe in either direction. */
const DEAD_ZONE_PX = 8;

export type SwipeIntent = 'undecided' | 'reply' | 'ignore';

/**
 * What a touch that has moved by (dx, dy) is: still undecided, a rightward
 * swipe to reply, or anything else (a scroll, a leftward swipe), which the
 * page keeps. Decided once, early, so a scroll is never hijacked.
 */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  if (Math.abs(dx) < DEAD_ZONE_PX && Math.abs(dy) < DEAD_ZONE_PX) return 'undecided';
  return dx > 0 && dx > Math.abs(dy) * 1.3 ? 'reply' : 'ignore';
}

/** How far the message follows the finger: one to one up to the stop, then with resistance. */
export function swipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  if (dx <= SWIPE_MAX_PX) return dx;
  return Math.min(SWIPE_MAX_PX + (dx - SWIPE_MAX_PX) * 0.25, SWIPE_MAX_PX + 24);
}
