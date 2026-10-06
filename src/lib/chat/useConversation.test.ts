import { expect, mock, test } from 'bun:test';

/** A database the RC5 migration has not reached (the Preview today): asking for the RC5 columns fails, the rest work. */
const reads: string[] = [];
mock.module('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => {
      let columns = '';
      let conversationId = '';
      const query = {
        select(c: string) { columns = c; reads.push(c.includes('album_id') ? 'rc5' : 'legacy'); return query; },
        eq(_field: string, value: string) { conversationId = value; return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          // Both first reads are in flight together, as an admin's two most recent threads are at start-up.
          return new Promise(r => setTimeout(r, 15)).then(() => (columns.includes('album_id')
            ? { data: null, error: { code: '42703', message: 'column messages.album_id does not exist' } }
            : { data: [{ id: `m-${conversationId}`, conversation_id: conversationId, sender_id: 'student', kind: 'image', body: null,
              storage_key: `chat/${conversationId}/photo.bin`, poster_key: null, poster_size_bytes: null, mime_type: 'image/jpeg',
              size_bytes: 1000, file_name: 'photo.jpg', voice_duration_seconds: null, read_at: null, created_at: '2026-10-01T10:00:00Z',
              client_id: null, deleted_at: null, media_purged: false, upload_status: 'ready' }], error: null }))
            .then(resolve, reject);
        },
      };
      return query;
    },
  },
}));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: null }) }));

const { warmConversation } = await import('./useConversation');

test('threads read at the same moment on a database without the RC5 columns each come back whole', async () => {
  const [first, second] = await Promise.all([warmConversation('admin', 'thread-a'), warmConversation('admin', 'thread-b')]);
  // Before: whichever answer came second found the flag already flipped, skipped its retry, and its thread came back empty.
  expect(first.map(m => m.storageKey)).toEqual(['chat/thread-a/photo.bin']);
  expect(second.map(m => m.storageKey)).toEqual(['chat/thread-b/photo.bin']);
  expect(reads.filter(r => r === 'legacy').length).toBe(2);
});

test('a mixed batch keeps its photos and videos together (the album), then its documents, each in the order picked', async () => {
  const { batchOrder } = await import('./useConversation');
  const picked = [
    { kind: 'image' as const, name: 'p1' }, { kind: 'pdf' as const, name: 'd1' }, { kind: 'video' as const, name: 'v1' },
    { kind: 'file' as const, name: 'd2' }, { kind: 'image' as const, name: 'p2' },
  ];
  expect(batchOrder(picked).map(f => f.name)).toEqual(['p1', 'v1', 'p2', 'd1', 'd2']);
  // Twelve photos stay exactly as picked.
  const photos = Array.from({ length: 12 }, (_, i) => ({ kind: 'image' as const, name: `p${i}` }));
  expect(batchOrder(photos).map(f => f.name)).toEqual(photos.map(f => f.name));
});
