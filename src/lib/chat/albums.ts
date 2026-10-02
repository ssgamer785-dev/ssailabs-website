import type { ChatMessage } from './types';

export type ThreadEntry =
  | { type: 'single'; key: string; message: ChatMessage }
  | { type: 'album'; key: string; albumId: string; messages: ChatMessage[] };

const visual = (m: ChatMessage) => (m.kind === 'image' || m.kind === 'video') && !m.deletedAt;

/**
 * Photos and videos sent together are shown as one album; everything else
 * (text, voice, documents, a deleted item) stays its own bubble. Only items
 * that sit next to each other in the thread are grouped, so nothing is ever
 * moved out of the order it was sent in. An album of one (the rest deleted)
 * is an ordinary bubble again.
 */
export function groupAlbums(messages: ChatMessage[]): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (message.albumId && visual(message) && last?.type === 'album' && last.albumId === message.albumId
        && last.messages[0].senderId === message.senderId) {
      last.messages.push(message);
      continue;
    }
    if (message.albumId && visual(message)) {
      out.push({ type: 'album', key: `album:${message.albumId}:${message.clientId}`, albumId: message.albumId, messages: [message] });
      continue;
    }
    out.push({ type: 'single', key: message.clientId, message });
  }
  return out.map(entry => {
    if (entry.type !== 'album') return entry;
    if (entry.messages.length === 1) return { type: 'single', key: entry.messages[0].clientId, message: entry.messages[0] };
    return { ...entry, messages: [...entry.messages].sort((a, b) => (a.albumIndex ?? 0) - (b.albumIndex ?? 0)) };
  });
}
