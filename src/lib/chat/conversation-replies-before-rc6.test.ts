import { expect, mock, test } from 'bun:test';

/** A database with the RC5 columns but not yet the RC6 reply column (Production before the RC6 update). */
const reads: string[] = [];
const row = (conversationId: string) => ({
  id: `m-${conversationId}`, conversation_id: conversationId, sender_id: 'student', kind: 'text', body: 'hello',
  storage_key: null, poster_key: null, poster_size_bytes: null, mime_type: null, size_bytes: null, file_name: null,
  voice_duration_seconds: null, read_at: null, created_at: '2026-11-01T10:00:00Z', client_id: null, deleted_at: null,
  media_purged: false, upload_status: 'ready', album_id: null, album_index: null, album_size: null, album_kind: null,
  media_width: null, media_height: null,
});
mock.module('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => {
      let columns = '';
      let conversationId = '';
      const query = {
        select(c: string) { columns = c; reads.push(c.includes('reply_to_id') ? 'rc6' : c.includes('album_id') ? 'rc5' : 'legacy'); return query; },
        eq(_field: string, value: string) { conversationId = value; return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return new Promise(r => setTimeout(r, 10)).then(() => (columns.includes('reply_to_id')
            ? { data: null, error: { code: '42703', message: 'column messages.reply_to_id does not exist' } }
            : { data: [row(conversationId)], error: null }))
            .then(resolve, reject);
        },
      };
      return query;
    },
  },
}));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: null }) }));

const { warmConversation, chatAlbumsAvailable, chatRepliesAvailable , resetChatSchemaForTests } = await import('./useConversation');


test('before the RC6 update, threads still load (with albums), and replies are switched off rather than breaking the chat', async () => {
  resetChatSchemaForTests();
  const [first, second] = await Promise.all([warmConversation('admin', 'thread-a'), warmConversation('admin', 'thread-b')]);
  expect(first.map(m => m.body)).toEqual(['hello']);
  expect(second.map(m => m.body)).toEqual(['hello']);
  expect(first[0].replyToId).toBeNull();
  expect(chatAlbumsAvailable()).toBe(true);
  expect(chatRepliesAvailable()).toBe(false);
  // Each thread asked once with the reply column, then once without; never fell back to the pre-RC5 columns.
  expect(reads.filter(r => r === 'legacy')).toHaveLength(0);
  expect(reads.filter(r => r === 'rc5')).toHaveLength(2);
});
