import { describe, expect, mock, test } from 'bun:test';

mock.module('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
const { chatMediaItems, feedMediaItems, interleave, FEED_WINDOW } = await import('./warmup');
const { intentForPath } = await import('./intent');
import type { FeedPost } from '../community/useFeed';
import type { ChatMessage } from '../chat/types';

const post = (id: string, over: Partial<FeedPost> = {}): FeedPost => ({
  id, authorId: 'a', channel: 'students', title: null, body: 'x', instrument: null, entryPrice: null, stopLoss: null, takeProfit: null,
  attachment: 'image', storageKey: `posts/${id}.bin`, posterKey: null, mimeType: 'image/png', fileName: null, sizeBytes: 1000,
  mediaPurged: false, chartSeed: null, isAnonymous: false, createdAt: '2026-10-03T00:00:00Z', authorName: 'A', authorRole: 'student',
  isMine: false, likeCount: 0, commentCount: 0, likedByMe: false, ...over,
});
const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: `i${n}`, postId: 'p', position: n, kind: 'image' as const, storageKey: `posts/item${n}.bin`, posterKey: null, mimeType: 'image/jpeg',
  sizeBytes: 500 + n, fileName: null, width: 10, height: 10, mediaPurged: false, ...over,
});
const message = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, clientId: id, conversationId: 'c', senderId: 's', kind: 'image', body: null, storageKey: `chat/c/${id}.bin`, posterKey: null,
  posterSizeBytes: null, mimeType: 'image/jpeg', sizeBytes: 2000, fileName: null, durationSeconds: null, readAt: null,
  createdAt: '2026-10-03T00:00:00Z', deletedAt: null, mediaPurged: false, uploadStatus: 'ready', status: 'sent', ...over,
});

describe('what the first screens show', () => {
  test('a feed: the first posts\' photos, video posters, and every visible tile of an album (at most four)', () => {
    const posts = [
      post('p1'),
      post('p2', { attachment: 'video', storageKey: 'posts/p2.bin', posterKey: 'posts/p2-poster.jpg', sizeBytes: 9_000_000 }),
      post('p3', { extraMedia: [item(1), item(2, { kind: 'video', storageKey: 'posts/v.bin', posterKey: 'posts/v-poster.jpg' }), item(3), item(4), item(5)] }),
      post('p4', { attachment: 'pdf', storageKey: 'posts/doc.pdf' }),
      post('p5'),
    ];
    const items = feedMediaItems(posts);
    expect(items.map(i => i.key)).toEqual(['posts/p1.bin', 'posts/p2-poster.jpg', 'posts/p3.bin', 'posts/item1.bin', 'posts/v-poster.jpg', 'posts/item3.bin']);
    expect(items.every(i => i.scope === 'post')).toBe(true);
    // A video contributes its poster only: never the clip's own bytes.
    expect(items.find(i => i.key === 'posts/p2-poster.jpg')!.bytes).toBeNull();
    expect(FEED_WINDOW).toBe(4);
  });

  test('purged media and pictures withheld to keep an author anonymous are never prepared', () => {
    const items = feedMediaItems([
      post('gone', { mediaPurged: true }),
      post('withheld', { isAnonymous: true, isMine: false, storageKey: null }),
      post('ok'),
      post('album', { extraMedia: [item(1, { mediaPurged: true }), item(2)] }),
    ]);
    expect(items.map(i => i.key)).toEqual(['posts/ok.bin', 'posts/album.bin', 'posts/item2.bin']);
  });

  test('a thread: the newest photos and video posters first; deleted, purged, unfinished and own unsent ones skipped', () => {
    const thread = [
      message('m1'), message('m2', { kind: 'text', storageKey: null }), message('m3', { deletedAt: '2026-10-03T01:00:00Z' }),
      message('m4', { mediaPurged: true }), message('m5', { uploadStatus: 'pending' }), message('m6', { status: 'uploading' }),
      message('m7', { kind: 'video', posterKey: 'chat/c/m7-poster.jpg', posterSizeBytes: 40_000 }), message('m8', { kind: 'pdf' }), message('m9'),
    ];
    const items = chatMediaItems(thread);
    expect(items.map(i => i.key)).toEqual(['chat/c/m9.bin', 'chat/c/m7-poster.jpg', 'chat/c/m1.bin']);
    expect(items.every(i => i.scope === 'chat')).toBe(true);
    expect(chatMediaItems(thread, 2).map(i => i.key)).toEqual(['chat/c/m9.bin']);
  });

  test('every screen\'s top picture comes before anyone\'s second', () => {
    expect(interleave(['o1', 'o2', 'o3'], ['s1'], ['c1', 'c2'])).toEqual(['o1', 's1', 'c1', 'o2', 'c2', 'o3']);
    expect(interleave()).toEqual([]);
  });
});

describe('links that prepare their screen', () => {
  test('each in-app destination names the screen it opens', () => {
    expect(intentForPath('/community')).toBe('community');
    expect(intentForPath('/community?tab=students')).toBe('community:students');
    expect(intentForPath('/post?post=abc&comment=x')).toBe('post:abc');
    expect(intentForPath('/analysis?post=abc')).toBe('post:abc');
    expect(intentForPath('/post')).toBeUndefined();
    expect(intentForPath('/chat/admin?c=c1&m=m1')).toBe('chat:c1');
    expect(intentForPath('/chat/admin')).toBe('chat');
    expect(intentForPath('/chat')).toBe('chat');
    expect(intentForPath('/admin-inbox')).toBe('chat');
    expect(intentForPath('/notifications')).toBe('notifications');
    expect(intentForPath('/calculator')).toBeUndefined();
  });
});
