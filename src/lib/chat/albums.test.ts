import { describe, expect, it } from 'bun:test';
import { groupAlbums } from './albums';
import type { ChatMessage } from './types';

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, clientId: id, conversationId: 'c', senderId: 's', kind: 'image', body: null, storageKey: `k-${id}`, posterKey: null,
  posterSizeBytes: null, mimeType: 'image/jpeg', sizeBytes: 1, fileName: null, durationSeconds: null, readAt: null,
  createdAt: '2026-10-02T10:00:00Z', deletedAt: null, mediaPurged: false, uploadStatus: 'ready', status: 'sent', ...over,
});

describe('chat albums', () => {
  it('groups photos and videos sent together, in the order they were picked', () => {
    const entries = groupAlbums([
      m('t', { kind: 'text', storageKey: null }),
      m('b', { albumId: 'A', albumIndex: 1 }),
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('c', { albumId: 'A', albumIndex: 2, kind: 'video' }),
      m('u', { kind: 'text', storageKey: null }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['single', 'album', 'single']);
    expect(entries[1].type === 'album' && entries[1].messages.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('documents and deleted items stay their own bubbles; an album of one is a single', () => {
    const entries = groupAlbums([
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('b', { albumId: 'A', albumIndex: 1, deletedAt: '2026-10-02T11:00:00Z' }),
      m('d1', { albumId: 'D', albumIndex: 0, kind: 'pdf' }),
      m('d2', { albumId: 'D', albumIndex: 1, kind: 'pdf' }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['single', 'single', 'single', 'single']);
  });
  it('never pulls a message out of its place: a message in between splits the album', () => {
    const entries = groupAlbums([
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('x', { kind: 'text', storageKey: null, senderId: 'other' }),
      m('b', { albumId: 'A', albumIndex: 1 }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['single', 'single', 'single']);
  });
});
