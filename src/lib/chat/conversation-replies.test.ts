import { expect, mock, test } from 'bun:test';

/** A database with the RC6 reply column: a reply comes back with the id of the message it answers. */
mock.module('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => {
      let conversationId = '';
      const query = {
        select() { return query; },
        eq(_field: string, value: string) { conversationId = value; return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: [{
            id: 'reply', conversation_id: conversationId, sender_id: 'student', kind: 'image', body: null,
            storage_key: 'chat/x/1.bin', poster_key: null, poster_size_bytes: null, mime_type: 'image/jpeg', size_bytes: 10, file_name: 'a.jpg',
            voice_duration_seconds: null, read_at: null, created_at: '2026-11-01T10:00:01Z', client_id: null, deleted_at: null,
            media_purged: false, upload_status: 'ready', album_id: null, album_index: null, album_size: null, album_kind: null,
            media_width: 10, media_height: 10, reply_to_id: 'original',
          }], error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: null }) }));

const { warmConversation, chatRepliesAvailable , resetChatSchemaForTests } = await import('./useConversation');


test('with the RC6 update, a photo sent as a reply comes back pointing at the message it answers', async () => {
  resetChatSchemaForTests();
  const [reply] = await warmConversation('admin', 'thread');
  expect(reply.replyToId).toBe('original');
  expect(reply.kind).toBe('image');
  expect(chatRepliesAvailable()).toBe(true);
});
