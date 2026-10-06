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
  it('a reply that arrives while the album is still uploading does not cut it: one album, where it started', () => {
    const entries = groupAlbums([
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('x', { kind: 'text', storageKey: null, senderId: 'other' }),
      m('b', { albumId: 'A', albumIndex: 1 }),
      m('c', { albumId: 'A', albumIndex: 2 }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['album', 'single']);
    expect(entries[0].type === 'album' && entries[0].messages.map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(entries[1].type === 'single' && entries[1].message.id).toBe('x');
  });
  it('a document sent in the same batch stays its own bubble after the album; the album stays whole', () => {
    const entries = groupAlbums([
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('d', { albumId: 'A', albumIndex: 2, kind: 'pdf' }),
      m('b', { albumId: 'A', albumIndex: 1 }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['album', 'single']);
    expect(entries[0].type === 'album' && entries[0].messages.map(x => x.id)).toEqual(['a', 'b']);
  });
  it("only the sender's own items form an album: the same album id from someone else is never pulled in", () => {
    const entries = groupAlbums([
      m('a', { albumId: 'A', albumIndex: 0 }),
      m('b', { albumId: 'A', albumIndex: 1 }),
      m('z', { albumId: 'A', albumIndex: 2, senderId: 'other' }),
    ]);
    expect(entries.map(e => e.type)).toEqual(['album', 'single']);
    expect(entries[0].type === 'album' && entries[0].messages.map(x => x.id)).toEqual(['a', 'b']);
  });
  it('twelve photos stay one album of twelve, in the order picked', () => {
    const photos = Array.from({ length: 12 }, (_, i) => m(`p${i}`, { albumId: 'A', albumIndex: (i * 7) % 12 }));
    const entries = groupAlbums(photos);
    expect(entries.length).toBe(1);
    expect(entries[0].type === 'album' && entries[0].messages.map(x => x.albumIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
