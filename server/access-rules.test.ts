import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { S3Client } from '@aws-sdk/client-s3';
import webpush from 'web-push';
import app from './app';
import { resetClientsForTests } from './r2';
import { isConversationObjectKey, isResumableChatUpload } from './chat-media';
import { isAuthorPostKey } from './post-media';
import { startFakeSupabase, type FakeSupabase, type Row } from './testing/fake-supabase';

/**
 * Route-level rules for objects named by client-written rows, and for who
 * receives push: exercised through the real app with an in-memory Supabase,
 * recorded R2 calls and recorded push sends.
 */
const ADMIN = '11111111-1111-4111-8111-111111111111';
const STUDENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEWCOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONV = 'c0000000-0000-4000-8000-00000000000a';
const OTHER_CONV = 'c0000000-0000-4000-8000-00000000000b';
const NEW_CONV = 'c0000000-0000-4000-8000-00000000000c';
const TOKENS = { 'admin-token': ADMIN, 'student-token': STUDENT, 'other-token': OTHER, 'newcomer-token': NEWCOMER };

const u = (n: number) => `0f0f0f0f-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chatKey = (conversation: string, n: number, ext = 'bin') => `chat/${conversation}/17900000000${String(n).padStart(2, '0')}-${u(n)}.${ext}`;
const OWN_KEY = chatKey(CONV, 1);
const ADMIN_KEY_IN_THREAD = chatKey(CONV, 2, 'pdf');
const OTHER_THREAD_KEY = chatKey(OTHER_CONV, 3);
const OFFICIAL_KEY = `posts/${ADMIN}/1790000000000-${u(4)}.bin`;
const STUDENT_POST_KEY = `posts/${STUDENT}/1790000000001-${u(5)}.bin`;
const AVATAR_KEY = `avatars/${OTHER}/1790000000000-${u(6)}.bin`;

const deletedKeys: string[][] = [];
const pushes: string[] = [];
let originalSend: typeof S3Client.prototype.send;
let originalNotify: typeof webpush.sendNotification;
let fake: FakeSupabase;
const failWrites: Record<string, 'missing' | 'error'> = {};
let base: string;
let server: Server;
let purgeVictims: Row[] = [];
let staleUploads: Row[] = [];
let expiredPosts: Row[] = [];

const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_WEBHOOK_SECRET'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

function message(id: string, over: Row): Row {
  return { id, conversation_id: CONV, sender_id: STUDENT, kind: 'image', storage_key: null, poster_key: null,
    mime_type: 'image/jpeg', size_bytes: 1000, poster_size_bytes: null, upload_status: 'ready', deleted_at: null, media_purged: false, ...over };
}

function world(): Record<string, Row[]> {
  return {
    profiles: [
      { id: ADMIN, role: 'admin', activated_at: null, media_bytes_used: 0 },
      { id: STUDENT, role: 'student', activated_at: '2026-09-01T00:00:00Z', media_bytes_used: 0 },
      { id: OTHER, role: 'student', activated_at: '2026-09-01T00:00:00Z', media_bytes_used: 0 },
      { id: NEWCOMER, role: 'student', activated_at: null, media_bytes_used: 0 },
    ],
    conversations: [
      { id: CONV, student_id: STUDENT },
      { id: OTHER_CONV, student_id: OTHER },
      { id: NEW_CONV, student_id: NEWCOMER },
    ],
    messages: [
      message(u(101), { storage_key: OWN_KEY }),
      message(u(102), { sender_id: ADMIN, kind: 'pdf', mime_type: 'application/pdf', storage_key: ADMIN_KEY_IN_THREAD }),
      message(u(103), { conversation_id: OTHER_CONV, sender_id: OTHER, storage_key: OTHER_THREAD_KEY }),
    ],
    posts: [
      { id: u(201), author_id: ADMIN, storage_key: OFFICIAL_KEY, poster_key: null, media_purged: false },
      { id: u(202), author_id: STUDENT, storage_key: STUDENT_POST_KEY, poster_key: null, media_purged: false },
    ],
    notifications: [],
    push_subscriptions: [],
    push_deliveries: [],
  };
}

beforeAll(() => {
  originalSend = S3Client.prototype.send;
  (S3Client.prototype as { send: unknown }).send = async function (command: { input?: { Delete?: { Objects?: { Key: string }[] } } }) {
    const keys = command?.input?.Delete?.Objects?.map(o => o.Key);
    if (keys) deletedKeys.push(keys);
    return { Errors: [] };
  };
  originalNotify = webpush.sendNotification;
  (webpush as { sendNotification: unknown }).sendNotification = async (subscription: { endpoint: string }) => {
    pushes.push(subscription.endpoint);
    return { statusCode: 201, body: '', headers: {} };
  };
});

afterAll(() => {
  S3Client.prototype.send = originalSend;
  webpush.sendNotification = originalNotify;
});

beforeEach(async () => {
  deletedKeys.length = 0;
  pushes.length = 0;
  purgeVictims = [];
  staleUploads = [];
  expiredPosts = [];
  for (const table of Object.keys(failWrites)) delete failWrites[table];
  fake = await startFakeSupabase({
    tokens: TOKENS,
    failWrites,
    tables: world(),
    rpc: {
      select_user_media_to_purge: () => purgeVictims,
      select_stale_pending_uploads: () => staleUploads,
      select_expired_post_media: () => expiredPosts,
      purge_expired_posts: () => expiredPosts.length,
      mark_chat_media_purged: ({ p_message_ids }, tables) => {
        for (const row of tables.messages) {
          if ((p_message_ids as string[]).includes(row.id as string)) Object.assign(row, { media_purged: true, storage_key: null, poster_key: null });
        }
      },
      delete_stale_pending_uploads: ({ p_message_ids }, tables) => {
        const before = tables.messages.length;
        tables.messages = tables.messages.filter(row => !(p_message_ids as string[]).includes(row.id as string));
        return before - tables.messages.length;
      },
      mark_post_media_purged: ({ p_post_ids }, tables) => {
        for (const row of tables.posts) {
          if ((p_post_ids as string[]).includes(row.id as string)) Object.assign(row, { media_purged: true, storage_key: null, poster_key: null });
        }
      },
    },
  });
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    SUPABASE_URL: fake.url, VITE_SUPABASE_URL: fake.url, SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    R2_ACCOUNT_ID: 'account-fixture', R2_ACCESS_KEY_ID: 'access-fixture', R2_SECRET_ACCESS_KEY: 'secret-fixture', R2_BUCKET: 'bucket-fixture',
    VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:support@example.test',
    PUSH_WEBHOOK_SECRET: 'webhook-secret-fixture',
  });
  resetClientsForTests();
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.close();
  fake.close();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});

async function call(path: string, token: string | null, body?: unknown, method = 'POST', headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json };
}

/** The object a presigned URL is for (the bucket rides in the host name). */
const signedKey = (url: unknown) => (typeof url === 'string' ? decodeURIComponent(new URL(url).pathname).slice(1) : null);
const addMessage = (row: Row) => fake.tables.messages.push(row);

describe('key ownership helpers', () => {
  test('a chat key belongs only to the conversation it names', () => {
    expect(isConversationObjectKey(OWN_KEY, CONV)).toBe(true);
    expect(isConversationObjectKey(OWN_KEY, OTHER_CONV)).toBe(false);
    for (const key of [OFFICIAL_KEY, AVATAR_KEY, `chat/${CONV}/../${OTHER_CONV}/x.bin`, `chat/${CONV}/sub/x.bin`, `chat/${CONV}/`, '', null]) {
      expect(isConversationObjectKey(key, CONV)).toBe(false);
    }
  });

  test('a resumable upload must be a minted key with its exact poster companion', () => {
    const stem = `chat/${CONV}/1790000000000-${u(9)}`;
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: `${stem}.bin`, poster_key: `${stem}-poster.jpg` })).toBe(true);
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: `${stem}.bin`, poster_key: null })).toBe(true);
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: `${stem}.bin`, poster_key: OWN_KEY })).toBe(false);
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: `chat/${CONV}/anything.bin`, poster_key: null })).toBe(false);
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: OFFICIAL_KEY, poster_key: null })).toBe(false);
  });

  test('a post key belongs only to its author', () => {
    expect(isAuthorPostKey(OFFICIAL_KEY, ADMIN)).toBe(true);
    expect(isAuthorPostKey(OFFICIAL_KEY, STUDENT)).toBe(false);
    expect(isAuthorPostKey(STUDENT_POST_KEY, STUDENT)).toBe(true);
    for (const key of [AVATAR_KEY, OWN_KEY, `posts/${STUDENT}/../${ADMIN}/x.bin`, ` ${STUDENT_POST_KEY}`]) {
      expect(isAuthorPostKey(key, STUDENT)).toBe(false);
    }
  });
});

describe('resuming a chat upload', () => {
  const pending = (id: string, over: Row) => message(id, { upload_status: 'pending', ...over });

  test('re-signs the sender\'s own interrupted upload, with its poster', async () => {
    const stem = `chat/${CONV}/1790000000000-${u(10)}`;
    addMessage(pending(u(110), { kind: 'video', mime_type: 'video/mp4', size_bytes: 5_000_000, storage_key: `${stem}.bin`, poster_key: `${stem}-poster.jpg`, poster_size_bytes: 40_000 }));
    const res = await call('/api/chat/resume-upload', 'student-token', { messageId: u(110) });
    expect(res.status).toBe(200);
    expect(signedKey(res.body.uploadUrl)).toBe(`${stem}.bin`);
    expect(signedKey(res.body.posterUploadUrl)).toBe(`${stem}-poster.jpg`);
  });

  test('the admin can resume their own upload in a member\'s thread', async () => {
    const key = `chat/${CONV}/1790000000000-${u(11)}.pdf`;
    addMessage(pending(u(111), { sender_id: ADMIN, kind: 'pdf', mime_type: 'application/pdf', storage_key: key }));
    const res = await call('/api/chat/resume-upload', 'admin-token', { messageId: u(111) });
    expect(res.status).toBe(200);
    expect(signedKey(res.body.uploadUrl)).toBe(key);
  });

  test('refuses keys outside the row\'s own conversation', async () => {
    for (const [i, key] of [OFFICIAL_KEY, AVATAR_KEY, OTHER_THREAD_KEY, `chat/${CONV}/../${OTHER_CONV}/1790000000000-${u(1)}.bin`].entries()) {
      addMessage(pending(u(120 + i), { storage_key: key }));
      const res = await call('/api/chat/resume-upload', 'student-token', { messageId: u(120 + i) });
      expect(res.status).toBe(400);
      expect(res.body.uploadUrl).toBeUndefined();
    }
  });

  test('refuses a poster key that is not the upload\'s own companion', async () => {
    const stem = `chat/${CONV}/1790000000000-${u(12)}`;
    addMessage(pending(u(130), { kind: 'video', mime_type: 'video/mp4', storage_key: `${stem}.bin`, poster_key: AVATAR_KEY, poster_size_bytes: 1000 }));
    expect((await call('/api/chat/resume-upload', 'student-token', { messageId: u(130) })).status).toBe(400);
  });

  test('refuses a key another message already names', async () => {
    addMessage(pending(u(131), { kind: 'pdf', mime_type: 'application/pdf', storage_key: ADMIN_KEY_IN_THREAD }));
    expect((await call('/api/chat/resume-upload', 'student-token', { messageId: u(131) })).status).toBe(400);
  });

  test('refuses sizes and types /upload-url would not have issued', async () => {
    addMessage(pending(u(132), { storage_key: chatKey(CONV, 13), size_bytes: 5 * 1024 ** 3 }));
    addMessage(pending(u(133), { storage_key: chatKey(CONV, 14), mime_type: 'text/html' }));
    expect((await call('/api/chat/resume-upload', 'student-token', { messageId: u(132) })).status).toBe(413);
    expect((await call('/api/chat/resume-upload', 'student-token', { messageId: u(133) })).status).toBe(400);
  });

  test('requires an activated account, and only the sender', async () => {
    addMessage(pending(u(134), { conversation_id: NEW_CONV, sender_id: NEWCOMER, storage_key: chatKey(NEW_CONV, 15) }));
    expect((await call('/api/chat/resume-upload', 'newcomer-token', { messageId: u(134) })).status).toBe(403);
    addMessage(pending(u(135), { storage_key: chatKey(CONV, 16) }));
    expect((await call('/api/chat/resume-upload', 'admin-token', { messageId: u(135) })).status).toBe(403);
    expect((await call('/api/chat/resume-upload', null, { messageId: u(135) })).status).toBe(401);
  });
});

describe('removing a chat attachment', () => {
  test('deletes the sender\'s own objects and marks the row purged', async () => {
    const res = await call('/api/chat/delete-media', 'student-token', { messageId: u(101) });
    expect(res.status).toBe(200);
    expect(deletedKeys).toEqual([[OWN_KEY]]);
    expect(fake.tables.messages.find(r => r.id === u(101))?.media_purged).toBe(true);
  });

  test('the admin can remove their own attachment in a member\'s thread', async () => {
    expect((await call('/api/chat/delete-media', 'admin-token', { messageId: u(102) })).status).toBe(200);
    expect(deletedKeys).toEqual([[ADMIN_KEY_IN_THREAD]]);
  });

  test('a pending upload is removed entirely', async () => {
    addMessage(message(u(140), { upload_status: 'pending', storage_key: chatKey(CONV, 17) }));
    expect((await call('/api/chat/delete-media', 'student-token', { messageId: u(140) })).status).toBe(200);
    expect(deletedKeys).toEqual([[chatKey(CONV, 17)]]);
    expect(fake.tables.messages.some(r => r.id === u(140))).toBe(false);
  });

  test('refuses rows naming objects outside their conversation, and deletes nothing', async () => {
    for (const [i, key] of [OFFICIAL_KEY, AVATAR_KEY, OTHER_THREAD_KEY].entries()) {
      addMessage(message(u(150 + i), { storage_key: chatKey(CONV, 20 + i), poster_key: key }));
      expect((await call('/api/chat/delete-media', 'student-token', { messageId: u(150 + i) })).status).toBe(409);
    }
    expect(deletedKeys).toEqual([]);
  });

  test('refuses a row naming another message\'s object', async () => {
    addMessage(message(u(160), { kind: 'pdf', storage_key: ADMIN_KEY_IN_THREAD }));
    expect((await call('/api/chat/delete-media', 'student-token', { messageId: u(160) })).status).toBe(409);
    expect(deletedKeys).toEqual([]);
    expect(fake.tables.messages.find(r => r.id === u(102))?.storage_key).toBe(ADMIN_KEY_IN_THREAD);
  });

  test('requires an activated account', async () => {
    addMessage(message(u(161), { conversation_id: NEW_CONV, sender_id: NEWCOMER, storage_key: chatKey(NEW_CONV, 24) }));
    expect((await call('/api/chat/delete-media', 'newcomer-token', { messageId: u(161) })).status).toBe(403);
    expect(deletedKeys).toEqual([]);
  });
});

describe('storage clean-up only ever removes the row\'s own objects', () => {
  test('making room deletes the uploader\'s old media but leaves objects owned elsewhere', async () => {
    addMessage(message(u(170), { storage_key: chatKey(CONV, 30), poster_key: OFFICIAL_KEY }));
    purgeVictims = [
      { id: u(101), storage_key: OWN_KEY, poster_key: null, size_bytes: 1000 },
      { id: u(170), storage_key: chatKey(CONV, 30), poster_key: OFFICIAL_KEY, size_bytes: 1000 },
    ];
    const res = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'image', mimeType: 'image/png', sizeBytes: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(2);
    expect(deletedKeys).toEqual([[OWN_KEY, chatKey(CONV, 30)]]);
    expect(fake.tables.messages.filter(r => [u(101), u(170)].includes(r.id as string)).every(r => r.media_purged)).toBe(true);
  });

  test('a new upload is still issued inside the caller\'s conversation', async () => {
    const res = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'voice', mimeType: 'audio/mp4', sizeBytes: 4000 });
    expect(res.status).toBe(200);
    expect(String(res.body.storageKey)).toMatch(new RegExp(`^chat/${CONV}/\\d{13}-[0-9a-f-]{36}\\.m4a$`));
    expect(isResumableChatUpload({ conversation_id: CONV, storage_key: res.body.storageKey, poster_key: null })).toBe(true);
  });

  test('the stale-upload sweep leaves objects owned elsewhere and removes the rows', async () => {
    addMessage(message(u(180), { upload_status: 'pending', storage_key: chatKey(CONV, 31) }));
    addMessage(message(u(181), { upload_status: 'pending', storage_key: AVATAR_KEY, poster_key: ADMIN_KEY_IN_THREAD }));
    staleUploads = [
      { id: u(180), storage_key: chatKey(CONV, 31), poster_key: null },
      { id: u(181), storage_key: AVATAR_KEY, poster_key: ADMIN_KEY_IN_THREAD },
    ];
    const { sweepStaleUploads } = await import('./chat-media');
    expect(await sweepStaleUploads()).toBe(2);
    expect(deletedKeys).toEqual([[chatKey(CONV, 31)]]);
    expect(fake.tables.messages.find(r => r.id === u(102))?.storage_key).toBe(ADMIN_KEY_IN_THREAD);
  });
});

describe('removing post media', () => {
  test('an author removes their own post\'s media', async () => {
    expect((await call('/api/posts/delete-media', 'student-token', { postId: u(202) })).status).toBe(200);
    expect(deletedKeys).toEqual([[STUDENT_POST_KEY]]);
  });

  test('the admin removes a member\'s post media and their own', async () => {
    expect((await call('/api/posts/delete-media', 'admin-token', { postId: u(202) })).status).toBe(200);
    expect((await call('/api/posts/delete-media', 'admin-token', { postId: u(201) })).status).toBe(200);
    expect(deletedKeys).toEqual([[STUDENT_POST_KEY], [OFFICIAL_KEY]]);
  });

  test('refuses a post whose row names another author\'s object, and deletes nothing', async () => {
    fake.tables.posts.push({ id: u(203), author_id: STUDENT, storage_key: OFFICIAL_KEY, poster_key: null, media_purged: false });
    fake.tables.posts.push({ id: u(204), author_id: STUDENT, storage_key: STUDENT_POST_KEY, poster_key: AVATAR_KEY, media_purged: false });
    expect((await call('/api/posts/delete-media', 'student-token', { postId: u(203) })).status).toBe(409);
    expect((await call('/api/posts/delete-media', 'student-token', { postId: u(204) })).status).toBe(409);
    expect((await call('/api/posts/delete-media', 'admin-token', { postId: u(203) })).status).toBe(409);
    expect(deletedKeys).toEqual([]);
    expect(fake.tables.posts.find(r => r.id === u(201))?.storage_key).toBe(OFFICIAL_KEY);
  });

  test('retention deletes each expired post\'s own objects only', async () => {
    fake.tables.posts.push({ id: u(205), author_id: STUDENT, storage_key: OFFICIAL_KEY, poster_key: null, media_purged: false });
    expiredPosts = [
      { id: u(202), storage_key: STUDENT_POST_KEY, poster_key: null },
      { id: u(205), storage_key: OFFICIAL_KEY, poster_key: null },
    ];
    const res = await call('/api/posts/run-retention', 'admin-token', {});
    expect(res.status).toBe(200);
    expect(deletedKeys).toEqual([[STUDENT_POST_KEY]]);
  });
});

describe('push delivery follows in-app access', () => {
  const subscription = (endpoint: string) => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });
  const dispatch = (id: string) => call('/api/push/dispatch', null, { type: 'INSERT', table: 'notifications', record: { id } }, 'POST',
    { 'x-push-webhook-secret': 'webhook-secret-fixture' });

  test('activated members and the admin can register a device; others cannot', async () => {
    expect((await call('/api/push/subscribe', 'student-token', subscription('https://push.example.test/student'))).status).toBe(200);
    expect((await call('/api/push/subscribe', 'admin-token', subscription('https://push.example.test/admin'))).status).toBe(200);
    expect((await call('/api/push/subscribe', 'newcomer-token', subscription('https://push.example.test/newcomer'))).status).toBe(403);
    expect(fake.tables.push_subscriptions.map(r => r.user_id).sort()).toEqual([ADMIN, STUDENT].sort());
  });

  test('a notification is pushed to an activated member and to the admin', async () => {
    fake.tables.push_subscriptions.push(
      { id: u(301), user_id: STUDENT, endpoint: 'https://push.example.test/student', p256dh: 'B'.repeat(87), auth_key: 'A'.repeat(22) },
      { id: u(302), user_id: ADMIN, endpoint: 'https://push.example.test/admin', p256dh: 'B'.repeat(87), auth_key: 'A'.repeat(22) },
    );
    fake.tables.notifications.push(
      { id: u(311), user_id: STUDENT, kind: 'signal', title: 'Update', body: 'Body', related_post_id: null, related_conversation_id: null },
      { id: u(312), user_id: ADMIN, kind: 'chat', title: 'New message from a student', body: 'Hi', related_post_id: null, related_conversation_id: CONV },
    );
    expect((await dispatch(u(311))).body).toMatchObject({ ok: true, attempted: 1 });
    expect((await dispatch(u(312))).body).toMatchObject({ ok: true, attempted: 1 });
    expect(pushes).toEqual(['https://push.example.test/student', 'https://push.example.test/admin']);
  });

  test('nothing is pushed to an account that is not activated', async () => {
    fake.tables.push_subscriptions.push({ id: u(303), user_id: NEWCOMER, endpoint: 'https://push.example.test/newcomer', p256dh: 'B'.repeat(87), auth_key: 'A'.repeat(22) });
    fake.tables.notifications.push({ id: u(313), user_id: NEWCOMER, kind: 'signal', title: 'Update', body: 'Body', related_post_id: null, related_conversation_id: null });
    const res = await dispatch(u(313));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, attempted: 0, skipped: 'recipient-not-activated' });
    expect(pushes).toEqual([]);
    expect(fake.tables.push_deliveries).toEqual([]);
  });

  test('the webhook secret is still required', async () => {
    const res = await call('/api/push/dispatch', null, { type: 'INSERT', table: 'notifications', record: { id: u(311) } }, 'POST', { 'x-push-webhook-secret': 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('upload grants', () => {
  const grants = () => (fake.tables.media_upload_grants ?? []) as Row[];

  test('a chat upload URL is recorded as a grant for exactly that key, owner, thread, size and poster', async () => {
    const res = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'video', mimeType: 'video/mp4', sizeBytes: 900_000, posterBytes: 4_000 });
    expect(res.status).toBe(200);
    expect(grants()).toEqual([{
      storage_key: res.body.storageKey, owner_id: STUDENT, scope: 'chat', conversation_id: CONV,
      kind: 'video', mime_type: 'video/mp4', size_bytes: 900_000,
      poster_key: res.body.posterKey, poster_size_bytes: 4_000,
    }]);
    expect(signedKey(res.body.uploadUrl)).toBe(res.body.storageKey as string);
  });

  test('a community upload URL is recorded as a post grant with no conversation', async () => {
    const res = await call('/api/posts/upload-url', 'student-token', { kind: 'image', mimeType: 'image/png', sizeBytes: 50_000 });
    expect(res.status).toBe(200);
    expect(grants()).toEqual([{
      storage_key: res.body.storageKey, owner_id: STUDENT, scope: 'post', conversation_id: null,
      kind: 'image', mime_type: 'image/png', size_bytes: 50_000, poster_key: null, poster_size_bytes: null,
    }]);
  });

  test('a refused upload request records nothing', async () => {
    expect((await call('/api/chat/upload-url', 'student-token', { conversationId: OTHER_CONV, kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 })).status).toBe(403);
    expect((await call('/api/chat/upload-url', 'newcomer-token', { conversationId: NEW_CONV, kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 })).status).toBe(403);
    expect((await call('/api/posts/upload-url', 'newcomer-token', { kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 })).status).toBe(403);
    expect(grants()).toEqual([]);
  });

  test('before the grants table exists (API deployed ahead of the migration), uploads still work', async () => {
    failWrites.media_upload_grants = 'missing';
    const chat = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 });
    const post = await call('/api/posts/upload-url', 'admin-token', { kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 });
    expect([chat.status, post.status]).toEqual([200, 200]);
    expect(typeof chat.body.uploadUrl).toBe('string');
  });

  test('any other failure to record the grant withholds the upload URL', async () => {
    failWrites.media_upload_grants = 'error';
    const res = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'image', mimeType: 'image/png', sizeBytes: 1_000 });
    expect(res.status).toBe(503);
    expect(res.body.uploadUrl).toBeUndefined();
  });
});

describe('stored and served types (TP-024)', () => {
  const query = (url: unknown) => new URL(String(url)).searchParams;
  const signedHeaders = (url: unknown) => (query(url).get('X-Amz-SignedHeaders') ?? '').split(';');
  const served = (url: unknown) => ({ type: query(url).get('response-content-type'), disposition: query(url).get('response-content-disposition') });

  test('every upload URL binds the type it was issued for, as well as the size', async () => {
    const chat = await call('/api/chat/upload-url', 'student-token', { conversationId: CONV, kind: 'video', mimeType: 'video/mp4', sizeBytes: 900_000, posterBytes: 4_000 });
    const post = await call('/api/posts/upload-url', 'student-token', { kind: 'pdf', mimeType: 'application/pdf', sizeBytes: 50_000 });
    const avatar = await call('/api/profile/avatar-upload-url', 'student-token', { mimeType: 'image/png', sizeBytes: 20_000 });
    expect([chat.status, post.status, avatar.status]).toEqual([200, 200, 200]);
    for (const url of [chat.body.uploadUrl, chat.body.posterUploadUrl, post.body.uploadUrl, avatar.body.uploadUrl]) {
      expect(signedHeaders(url)).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    }
  });

  test('a resumed chat upload is re-signed for the row\'s own type', async () => {
    const key = chatKey(CONV, 40);
    addMessage(message(u(140), { storage_key: key, upload_status: 'pending', kind: 'voice', mime_type: 'audio/webm;codecs=opus' }));
    const res = await call('/api/chat/resume-upload', 'student-token', { messageId: u(140) });
    expect(res.status).toBe(200);
    expect(signedHeaders(res.body.uploadUrl)).toContain('content-type');
  });

  test('chat media is served as its recorded type: inline for media, a download for documents', async () => {
    const image = await call(`/api/chat/media-url?key=${encodeURIComponent(OWN_KEY)}`, 'student-token', undefined, 'GET');
    expect(served(image.body.url)).toEqual({ type: 'image/jpeg', disposition: 'inline' });

    const pdf = await call(`/api/chat/media-url?key=${encodeURIComponent(ADMIN_KEY_IN_THREAD)}`, 'student-token', undefined, 'GET');
    expect(served(pdf.body.url)).toEqual({ type: 'application/pdf', disposition: 'inline' });

    const docKey = chatKey(CONV, 41);
    addMessage(message(u(141), { storage_key: docKey, kind: 'file', mime_type: 'text/csv', file_name: 'Q3 "report"/draft.csv' }));
    const doc = await call(`/api/chat/media-url?key=${encodeURIComponent(docKey)}`, 'student-token', undefined, 'GET');
    expect(served(doc.body.url)).toEqual({ type: 'text/csv', disposition: 'attachment; filename="Q3 _report__draft.csv"' });
  });

  test('a row whose type is not on its kind\'s allow-list is never rendered by the browser', async () => {
    const key = chatKey(CONV, 42);
    addMessage(message(u(142), { storage_key: key, kind: 'pdf', mime_type: 'text/html' }));
    const res = await call(`/api/chat/media-url?key=${encodeURIComponent(key)}`, 'student-token', undefined, 'GET');
    expect(res.status).toBe(200);
    expect(served(res.body.url)).toEqual({ type: 'application/octet-stream', disposition: 'attachment' });
  });

  test('a video poster is served as a JPEG', async () => {
    const key = chatKey(CONV, 43);
    const poster = key.replace(/\.bin$/, '-poster.jpg');
    addMessage(message(u(143), { storage_key: key, poster_key: poster, kind: 'video', mime_type: 'video/mp4' }));
    const res = await call(`/api/chat/media-url?key=${encodeURIComponent(poster)}`, 'student-token', undefined, 'GET');
    expect(served(res.body.url)).toEqual({ type: 'image/jpeg', disposition: 'inline' });
  });

  test('community media follows the same rule', async () => {
    Object.assign(fake.tables.posts[1], { attachment: 'image', mime_type: 'image/webp', file_name: 'chart.webp' });
    const ok = await call(`/api/posts/media-url?key=${encodeURIComponent(STUDENT_POST_KEY)}`, 'other-token', undefined, 'GET');
    expect(served(ok.body.url)).toEqual({ type: 'image/webp', disposition: 'inline' });

    Object.assign(fake.tables.posts[1], { attachment: 'image', mime_type: 'text/html' });
    const bad = await call(`/api/posts/media-url?key=${encodeURIComponent(STUDENT_POST_KEY)}`, 'other-token', undefined, 'GET');
    expect(served(bad.body.url)).toEqual({ type: 'application/octet-stream', disposition: 'attachment; filename="chart.webp"' });
  });

  test('a profile picture link downloads rather than renders when opened directly', async () => {
    Object.assign(fake.tables.profiles[2], { avatar_key: AVATAR_KEY });
    const res = await call(`/api/profile/avatar-url?userId=${OTHER}`, 'student-token', undefined, 'GET');
    expect(res.status).toBe(200);
    expect(served(res.body.url).disposition).toBe('attachment');
  });
});
