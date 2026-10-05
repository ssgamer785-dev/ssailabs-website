import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { S3Client } from '@aws-sdk/client-s3';
import app from './app';
import { resetClientsForTests } from './r2';
import { CLEANUP_MIN_AGE_MS } from './storage-cleanup';
import { displayVariantKey } from './media-variants';
import { startFakeSupabase, type FakeSupabase, type Row } from './testing/fake-supabase';

/**
 * The admin storage clean-up, through the real app with an in-memory Supabase
 * and an in-memory bucket. The rule under test: only objects under the app's
 * own prefixes, that no row names and that are older than an hour, are ever
 * deleted — and only with the typed confirmation.
 */
const ADMIN = '11111111-1111-4111-8111-111111111111';
const STUDENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV = 'c0000000-0000-4000-8000-00000000000a';
const TOKENS = { 'admin-token': ADMIN, 'student-token': STUDENT };

const OLD = new Date(Date.now() - CLEANUP_MIN_AGE_MS - 60_000);
const FRESH = new Date(Date.now() - 10 * 60_000);

const K = {
  chatUsed: `chat/${CONV}/1790000000001-a.bin`,
  chatPoster: `chat/${CONV}/1790000000001-a-poster.jpg`,
  chatLegacyLink: `chat/${CONV}/1790000000002-legacy.bin`,
  chatOrphan: `chat/${CONV}/1790000000003-orphan.bin`,
  chatFreshOrphan: `chat/${CONV}/1790000000004-fresh.bin`,
  postUsed: 'posts/0b000000-0000-4000-8000-000000000001/1790000000005-p.bin',
  postGranted: 'posts/0b000000-0000-4000-8000-000000000002/1790000000006-g.bin',
  postOrphan: `posts/${STUDENT}/1790000000007-o.bin`,
  avatarCurrent: `avatars/${STUDENT}/1790000000008-now.bin`,
  avatarReplaced: `avatars/${STUDENT}/1790000000009-old.bin`,
  avatarLegacyUrl: `avatars/${ADMIN}/1790000000010-url.bin`,
  elsewhere: 'regency-tailors/catalogue.pdf',
  lookalike: 'chatter/1790000000011-x.bin',
};
/** Display copies: of a picture still in use (kept), and of one whose original is long gone (removed). */
const COPY_USED = displayVariantKey(K.chatUsed);
const COPY_ORPHAN = displayVariantKey(`chat/${CONV}/1790000000099-gone.bin`);
/** The originals a delete call removed (each call also removes those originals' display copies). */
const originalsOf = (calls: string[][]) => calls.flat().filter(k => !k.startsWith('variants/'));
const copiesOf = (calls: string[][]) => calls.flat().filter(k => k.startsWith('variants/'));

let objects: Map<string, { size: number; modified: Date }>;
let deleteCalls: string[][];
let listCalls: { Prefix?: string; StartAfter?: string }[];
let deleteErrorsNext = false;
let listExtraKey: string | null = null;
let originalSend: typeof S3Client.prototype.send;
let fake: FakeSupabase;
let base: string;
let server: Server;

const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

function world(): Record<string, Row[]> {
  return {
    profiles: [
      { id: ADMIN, role: 'admin', activated_at: null, avatar_key: null, avatar_url: `https://example.test/r2/${K.avatarLegacyUrl}?sig=1` },
      { id: STUDENT, role: 'student', activated_at: '2026-09-01T00:00:00Z', avatar_key: K.avatarCurrent, avatar_url: null },
    ],
    messages: [
      { id: 'm1', storage_key: K.chatUsed, poster_key: K.chatPoster, media_url: null },
      { id: 'm2', storage_key: null, poster_key: null, media_url: `https://files.example.test/${K.chatLegacyLink}` },
      { id: 'm3', storage_key: null, poster_key: null, media_url: null },
    ],
    posts: [{ id: 'p1', storage_key: K.postUsed, poster_key: null, attachment_url: null }],
    comments: [{ id: 'c1', voice_url: null }],
    media_upload_grants: [{ storage_key: K.postGranted, poster_key: null, scope: 'post', used_at: null }],
  };
}

function seedBucket() {
  objects = new Map();
  for (const key of [...Object.values(K), COPY_USED, COPY_ORPHAN]) objects.set(key, { size: 1000, modified: OLD });
  objects.get(K.chatFreshOrphan)!.modified = FRESH;
}

async function startWith(options: { missingTables?: string[]; tables?: Record<string, Row[]> } = {}) {
  fake = await startFakeSupabase({ tokens: TOKENS, tables: options.tables ?? world(), missingTables: options.missingTables });
  Object.assign(process.env, {
    SUPABASE_URL: fake.url, VITE_SUPABASE_URL: fake.url, SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    R2_ACCOUNT_ID: 'account-fixture', R2_ACCESS_KEY_ID: 'access-fixture', R2_SECRET_ACCESS_KEY: 'secret-fixture', R2_BUCKET: 'bucket-fixture',
  });
  resetClientsForTests();
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(() => {
  originalSend = S3Client.prototype.send;
  (S3Client.prototype as { send: unknown }).send = async function (command: { constructor: { name: string }; input: Record<string, unknown> }) {
    const input = command.input;
    if (command.constructor.name === 'ListObjectsV2Command') {
      const prefix = String(input.Prefix ?? '');
      const after = input.StartAfter as string | undefined;
      listCalls.push({ Prefix: input.Prefix as string, StartAfter: after });
      const keys = [...objects.keys()].filter(k => k.startsWith(prefix) && (!after || k > after)).sort();
      const page = keys.slice(0, Number(input.MaxKeys ?? 1000));
      const contents = page.map(k => ({ Key: k, Size: objects.get(k)!.size, LastModified: objects.get(k)!.modified }));
      if (listExtraKey) contents.push({ Key: listExtraKey, Size: 5, LastModified: OLD });
      return { Contents: contents, IsTruncated: keys.length > page.length };
    }
    if (command.constructor.name === 'DeleteObjectsCommand') {
      const keys = ((input.Delete as { Objects: { Key: string }[] }).Objects).map(o => o.Key);
      deleteCalls.push(keys);
      if (deleteErrorsNext) return { Errors: [{ Key: keys[0], Code: 'InternalError', Message: 'try again' }] };
      for (const key of keys) objects.delete(key);
      return { Errors: [] };
    }
    throw new Error(`unexpected S3 command ${command.constructor.name}`);
  };
});

afterAll(() => { S3Client.prototype.send = originalSend; });

beforeEach(() => {
  seedBucket();
  deleteCalls = [];
  listCalls = [];
  deleteErrorsNext = false;
  listExtraKey = null;
});

afterEach(() => {
  server?.close();
  fake?.close();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});

async function call(token: string | null, body: unknown) {
  const res = await fetch(`${base}/api/storage/unreferenced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
}

async function sweep(prefix: string, remove = false) {
  const pages: Record<string, unknown>[] = [];
  let after: string | null = null;
  do {
    const { status, json } = await call('admin-token', { prefix, after, remove, confirm: remove ? 'DELETE' : undefined });
    expect(status).toBe(200);
    pages.push(json);
    after = json.next as string | null;
  } while (after);
  return pages;
}

describe('who may use it', () => {
  test('signed-out callers get 401 and members 403; nothing is listed or deleted', async () => {
    await startWith();
    expect((await call(null, { prefix: 'chat/' })).status).toBe(401);
    expect((await call('student-token', { prefix: 'chat/' })).status).toBe(403);
    expect((await call('student-token', { prefix: 'chat/', remove: true, confirm: 'DELETE' })).status).toBe(403);
    expect(listCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });
});

describe('what it may look at', () => {
  test('only the app\'s own areas can be named', async () => {
    await startWith();
    for (const prefix of ['', 'regency-tailors/', 'chat', 'chatter/', '../', '/', 'avatars/../', 42, null]) {
      expect((await call('admin-token', { prefix })).status).toBe(400);
    }
    expect(listCalls).toEqual([]);
  });

  test('a position outside the named area is refused', async () => {
    await startWith();
    expect((await call('admin-token', { prefix: 'chat/', after: 'regency-tailors/a' })).status).toBe(400);
    expect((await call('admin-token', { prefix: 'chat/', after: 'posts/x' })).status).toBe(400);
    expect(listCalls).toEqual([]);
  });

  test('deleting needs the typed confirmation, exactly', async () => {
    await startWith();
    for (const confirm of [undefined, '', 'delete', 'DELETE ', 'yes']) {
      const { status } = await call('admin-token', { prefix: 'chat/', remove: true, confirm });
      expect(status).toBe(400);
    }
    expect(deleteCalls).toEqual([]);
  });
});

describe('dry run', () => {
  test('sorts every object into in use, recent and unused, and deletes nothing', async () => {
    await startWith();
    const [chat] = await sweep('chat/');
    expect(chat).toMatchObject({ prefix: 'chat/', scanned: 5, inUse: 3, recent: 1, unused: 1, unusedBytes: 1000, deleted: 0, next: null });
    const [posts] = await sweep('posts/');
    expect(posts).toMatchObject({ scanned: 3, inUse: 2, recent: 0, unused: 1, deleted: 0 });
    const [avatars] = await sweep('avatars/');
    expect(avatars).toMatchObject({ scanned: 3, inUse: 2, recent: 0, unused: 1, deleted: 0 });
    expect(deleteCalls).toEqual([]);
    expect(objects.size).toBe(Object.keys(K).length + 2);   // and the two display copies
  });
});

describe('delete', () => {
  test('removes exactly the unused objects and keeps everything else, including other projects\' files', async () => {
    await startWith();
    for (const prefix of ['chat/', 'posts/', 'avatars/']) await sweep(prefix, true);
    expect(originalsOf(deleteCalls).sort()).toEqual([K.avatarReplaced, K.chatOrphan, K.postOrphan].sort());
    // A removed picture's display copy goes with it (avatars have none).
    expect(copiesOf(deleteCalls).sort()).toEqual([K.chatOrphan, K.postOrphan].map(displayVariantKey).sort());
    for (const key of [K.chatUsed, K.chatPoster, K.chatLegacyLink, K.chatFreshOrphan, K.postUsed, K.postGranted,
      K.avatarCurrent, K.avatarLegacyUrl, K.elsewhere, K.lookalike]) {
      expect(objects.has(key)).toBe(true);
    }
    // A second pass finds nothing left to delete.
    const [again] = await sweep('chat/');
    expect(again).toMatchObject({ unused: 0, recent: 1 });
  });

  test('a key outside the requested area is never deleted, even if the listing returns one', async () => {
    await startWith();
    listExtraKey = K.elsewhere;
    await sweep('chat/', true);
    expect(originalsOf(deleteCalls)).toEqual([K.chatOrphan]);
    expect(copiesOf(deleteCalls)).toEqual([displayVariantKey(K.chatOrphan)]);
    expect(objects.has(K.elsewhere)).toBe(true);
  });

  test('a partial delete failure is reported as a failure, not as success', async () => {
    await startWith();
    deleteErrorsNext = true;
    const { status, json } = await call('admin-token', { prefix: 'chat/', remove: true, confirm: 'DELETE' });
    expect(status).toBe(503);
    expect(String(json.error)).toMatch(/clean-up is temporarily unavailable/i);
  });
});

describe('scale', () => {
  test('pages through thousands of objects without skipping any while deleting', async () => {
    const tables = world();
    // 2300 chat objects still named by a message (read back in pages of 1000),
    // and 2500 unused ones interleaved with them.
    objects = new Map();
    for (let i = 0; i < 4800; i++) {
      const key = `chat/${CONV}/${String(1790000000000 + i)}-${i}.bin`;
      objects.set(key, { size: 10, modified: OLD });
      if (i % 2 === 0 && i < 4600) (tables.messages as Row[]).push({ id: `x${i}`, storage_key: key, poster_key: null, media_url: null });
    }
    await startWith({ tables });
    const pages = await sweep('chat/', true);
    expect(pages.length).toBe(5);
    const deleted = pages.reduce((n, p) => n + Number(p.deleted), 0);
    const inUse = pages.reduce((n, p) => n + Number(p.inUse), 0);
    expect(inUse).toBe(2300);
    expect(deleted).toBe(2500);
    expect(objects.size).toBe(2300);
    for (const row of tables.messages as Row[]) if (String(row.id).startsWith('x')) expect(objects.has(row.storage_key as string)).toBe(true);
  });

  test('before the R1 migration (no grants table) it still runs, honouring every other reference', async () => {
    const tables = world();
    delete tables.media_upload_grants;
    await startWith({ tables, missingTables: ['media_upload_grants'] });
    const [posts] = await sweep('posts/');
    expect(posts).toMatchObject({ inUse: 1, unused: 2 });
  });
});

describe('display copies (variants/)', () => {
  test('a copy is in use exactly while its original is: the copy of a picture still named is kept, an orphan copy removed', async () => {
    await startWith();
    const [dry] = await sweep('variants/v1/');
    expect(dry).toMatchObject({ prefix: 'variants/v1/', scanned: 2, inUse: 1, unused: 1, deleted: 0 });
    await sweep('variants/v1/', true);
    expect(deleteCalls.flat()).toEqual([COPY_ORPHAN]);
    expect(objects.has(COPY_USED)).toBe(true);
  });
});
