import type { ChatMessage } from './types';

export type ThreadEntry =
  | { type: 'single'; key: string; message: ChatMessage }
  | { type: 'album'; key: string; albumId: string; messages: ChatMessage[] };

const visual = (m: ChatMessage) => (m.kind === 'image' || m.kind === 'video') && !m.deletedAt;

/**
 * Photos and videos sent together are shown as one album; everything else
 * (text, voice, documents, a deleted item) stays its own bubble. An album
 * stands where its first item is and holds every item of it, even when other
 * messages arrived between them — a reply written while a long album was
 * still uploading must not cut it into pieces. Only one sender's items form
 * an album: an album id is chosen by the sender's app, so it never pulls in
 * someone else's message. An album of one (the rest deleted) is an ordinary
 * bubble again.
 */
export function groupAlbums(messages: ChatMessage[]): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  const albums = new Map<string, Extract<ThreadEntry, { type: 'album' }>>();
  for (const message of messages) {
    if (message.albumId && visual(message)) {
      const id = `${message.senderId}\u0000${message.albumId}`;
      const album = albums.get(id);
      if (album) {
        album.messages.push(message);
        continue;
      }
      const entry = { type: 'album' as const, key: `album:${message.albumId}:${message.clientId}`, albumId: message.albumId, messages: [message] };
      albums.set(id, entry);
      out.push(entry);
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
