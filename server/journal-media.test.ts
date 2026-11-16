import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { S3Client } from '@aws-sdk/client-s3';
import { journalMediaRouter, journalObjectKey, removeMemberJournal } from './journal-media';
import { getAdmin, resetClientsForTests } from './r2';
import { startFakeSupabase, type FakeSupabase } from './testing/fake-supabase';

/**
 * Trading Journal screenshots through the real routes, against a stand-in for
 * Supabase (token checks, profiles, journal_trades) and with R2 deletes
 * captured instead of sent.
 */
const ASHA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const NEW = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const key = (owner: string, n: number) => `journal/${owner}/17632800000${String(n).padStart(2, '0')}-0f0f0f0f-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.bin`;
const TRADE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TRADE_A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const TRADE_B = 'bbbbbbbb-0000-4000-8000-000000000001';

const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const k of envKeys) savedEnv[k] = process.env[k];

const servers: Server[] = [];
let supa: FakeSupabase;
let base: string;
let deleted: string[];
let failDeletes: boolean;
const originalSend = S3Client.prototype.send;

beforeEach(async () => {
  deleted = [];
  failDeletes = false;
  (S3Client.prototype as { send: unknown }).send = async function (command: { constructor: { name: string }; input: { Delete?: { Objects?: { Key: string }[] } } }) {
    if (command.constructor.name !== 'DeleteObjectsCommand') throw new Error(`unexpected ${command.constructor.name}`);
    if (failDeletes) throw new Error('R2 is down');
    deleted.push(...(command.input.Delete?.Objects ?? []).map(o => o.Key));
    return { Errors: [] };
  };
  supa = await startFakeSupabase({
    tokens: { 'asha-token': ASHA, 'ben-token': BEN, 'new-token': NEW, 'admin-token': ADMIN },
    tables: {
      profiles: [
        { id: ASHA, role: 'student', activated_at: '2026-01-01T00:00:00Z' },
        { id: BEN, role: 'student', activated_at: '2026-01-01T00:00:00Z' },
        { id: NEW, role: 'student', activated_at: null },
        { id: ADMIN, role: 'admin', activated_at: null },
      ],
      journal_trades: [
        { id: TRADE_A, user_id: ASHA, screenshot_key: key(ASHA, 1), screenshot_mime: 'image/png' },
        { id: TRADE_A2, user_id: ASHA, screenshot_key: null, screenshot_mime: null },
        { id: TRADE_B, user_id: BEN, screenshot_key: key(BEN, 2), screenshot_mime: 'image/jpeg' },
      ],
    },
  });
  Object.assign(process.env, {
    SUPABASE_URL: supa.url, VITE_SUPABASE_URL: supa.url, SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture',
    R2_ACCOUNT_ID: 'account-fixture', R2_ACCESS_KEY_ID: 'access-fixture', R2_SECRET_ACCESS_KEY: 'secret-fixture', R2_BUCKET: 'bucket-fixture',
  });
  resetClientsForTests();
  const app = express();
  app.use(express.json());
  app.use('/api/journal', journalMediaRouter());
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  supa.close();
  for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  resetClientsForTests();
});
afterAll(() => { S3Client.prototype.send = originalSend; for (const s of servers) s.close(); });

const post = (path: string, body: unknown, token?: string) => fetch(`${base}/api/journal${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const get = (path: string, token?: string) => fetch(`${base}/api/journal${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const trades = () => supa.tables.journal_trades.map(t => t.id);

describe('journalObjectKey', () => {
  test('accepts exactly the keys the server mints', () => {
    expect(journalObjectKey(key(ASHA, 1))).toBe(key(ASHA, 1));
  });
  test('refuses traversal, encoding, other namespaces and other shapes', () => {
    for (const bad of [
      `journal/${ASHA}/../${BEN}/1763280000001-0f0f0f0f-0000-4000-8000-000000000001.bin`,
      `journal/${ASHA}/%2e%2e/x.bin`, `/journal/${ASHA}/x.bin`, `posts/${ASHA}/1763280000001-0f0f0f0f-0000-4000-8000-000000000001.bin`,
      `journal/${ASHA}/photo.png`, `journal/${ASHA}//1763280000001-0f0f0f0f-0000-4000-8000-000000000001.bin`, ` ${key(ASHA, 1)}`, 42, null,
    ]) expect(journalObjectKey(bad)).toBeNull();
  });
});

describe('POST /upload-url', () => {
  test('401 signed out, 403 not activated yet', async () => {
    expect((await post('/upload-url', { mimeType: 'image/png', sizeBytes: 1000 })).status).toBe(401);
    expect((await post('/upload-url', { mimeType: 'image/png', sizeBytes: 1000 }, 'new-token')).status).toBe(403);
  });
  test('only JPEG, PNG and WebP, up to 10 MB', async () => {
    expect((await post('/upload-url', { mimeType: 'image/gif', sizeBytes: 1000 }, 'asha-token')).status).toBe(400);
    expect((await post('/upload-url', { mimeType: 'text/html', sizeBytes: 1000 }, 'asha-token')).status).toBe(400);
    expect((await post('/upload-url', { mimeType: 'image/png', sizeBytes: 11 * 1024 * 1024 }, 'asha-token')).status).toBe(413);
    expect((await post('/upload-url', { mimeType: 'image/png' }, 'asha-token')).status).toBe(400);
  });
  test('the key is always in the caller\'s own namespace, whatever the body says, and the upload is signed for its type', async () => {
    const res = await post('/upload-url', { mimeType: 'image/webp', sizeBytes: 5000, userId: BEN, storageKey: key(BEN, 9) }, 'asha-token');
    expect(res.status).toBe(200);
    const body = await res.json() as { uploadUrl: string; storageKey: string };
    expect(journalObjectKey(body.storageKey)).toBe(body.storageKey);
    expect(body.storageKey.startsWith(`journal/${ASHA}/`)).toBe(true);
    expect(body.uploadUrl).toContain(encodeURIComponent(body.storageKey).replace(/%2F/g, '/'));
    expect(body.uploadUrl).toMatch(/X-Amz-SignedHeaders=[^&]*content-type/);
  });
});

describe('GET /screenshot-url', () => {
  test('signs the owner\'s own screenshot, served as its picture type, briefly', async () => {
    const res = await get(`/screenshot-url?trade=${TRADE_A}`, 'asha-token');
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; expiresIn: number };
    expect(body.url).toContain(key(ASHA, 1));
    expect(body.url).toContain('response-content-type=image%2Fpng');
    expect(body.expiresIn).toBeLessThanOrEqual(1800);
  });
  test('another member\'s trade, or the admin asking, answers as if it did not exist', async () => {
    expect((await get(`/screenshot-url?trade=${TRADE_B}`, 'asha-token')).status).toBe(404);
    expect((await get(`/screenshot-url?trade=${TRADE_A}`, 'admin-token')).status).toBe(404);
  });
  test('a trade without a screenshot, a bad id, and no session', async () => {
    expect((await get(`/screenshot-url?trade=${TRADE_A2}`, 'asha-token')).status).toBe(404);
    expect((await get('/screenshot-url?trade=../x', 'asha-token')).status).toBe(400);
    expect((await get(`/screenshot-url?trade=${TRADE_A}`)).status).toBe(401);
  });
  test('a row that somehow names a picture outside its owner\'s namespace is never signed', async () => {
    supa.tables.journal_trades[0].screenshot_key = key(BEN, 2);
    expect((await get(`/screenshot-url?trade=${TRADE_A}`, 'asha-token')).status).toBe(409);
  });
  test('before the database update, a clear message instead of an error', async () => {
    supa.close();
    supa = await startFakeSupabase({ tokens: { 'asha-token': ASHA }, tables: { profiles: [{ id: ASHA, role: 'student', activated_at: '2026-01-01T00:00:00Z' }] }, missingTables: ['journal_trades'] });
    Object.assign(process.env, { SUPABASE_URL: supa.url, VITE_SUPABASE_URL: supa.url });
    resetClientsForTests();
    const res = await get(`/screenshot-url?trade=${TRADE_A}`, 'asha-token');
    expect(res.status).toBe(503);
    expect((await res.json() as { error: string }).error).toContain('needs the latest database update');
  });
});

describe('POST /discard', () => {
  test('removes only the caller\'s own uploads that no trade uses', async () => {
    const res = await post('/discard', { keys: [key(ASHA, 7), key(ASHA, 1), key(BEN, 2), key(BEN, 8), 'posts/x/y.bin', `journal/${ASHA}/../x`] }, 'asha-token');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(deleted).toEqual([key(ASHA, 7)]);
  });
  test('400 for a malformed request, 401 signed out', async () => {
    expect((await post('/discard', { keys: [] }, 'asha-token')).status).toBe(400);
    expect((await post('/discard', { keys: Array.from({ length: 11 }, (_, i) => key(ASHA, i)) }, 'asha-token')).status).toBe(400);
    expect((await post('/discard', { keys: [key(ASHA, 7)] })).status).toBe(401);
    expect(deleted).toEqual([]);
  });
});

describe('POST /trades/:id/delete', () => {
  test('the owner deletes their trade: the picture, then the row', async () => {
    const res = await post(`/trades/${TRADE_A}/delete`, {}, 'asha-token');
    expect(res.status).toBe(200);
    expect(deleted).toEqual([key(ASHA, 1)]);
    expect(trades()).toEqual([TRADE_A2, TRADE_B]);
  });
  test('a trade without a picture is just deleted', async () => {
    expect((await post(`/trades/${TRADE_A2}/delete`, {}, 'asha-token')).status).toBe(200);
    expect(deleted).toEqual([]);
    expect(trades()).toEqual([TRADE_A, TRADE_B]);
  });
  test('nobody else can delete it — not another member, not the admin', async () => {
    expect((await post(`/trades/${TRADE_B}/delete`, {}, 'asha-token')).status).toBe(404);
    expect((await post(`/trades/${TRADE_A}/delete`, {}, 'admin-token')).status).toBe(404);
    expect(deleted).toEqual([]);
    expect(trades()).toEqual([TRADE_A, TRADE_A2, TRADE_B]);
  });
  test('if the picture cannot be removed, the trade stays so the delete can be retried', async () => {
    failDeletes = true;
    const res = await post(`/trades/${TRADE_A}/delete`, {}, 'asha-token');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(trades()).toContain(TRADE_A);
  });
});

describe('removeMemberJournal (Delete member)', () => {
  test('removes the member\'s pictures and trades, and nobody else\'s', async () => {
    const result = await removeMemberJournal(getAdmin()!, ASHA);
    expect(result).toEqual({ trades: 2, pictures: 1 });
    expect(deleted).toEqual([key(ASHA, 1)]);
    expect(trades()).toEqual([TRADE_B]);
  });
  test('if the pictures cannot be removed, the trades stay for a retry', async () => {
    failDeletes = true;
    await expect(removeMemberJournal(getAdmin()!, ASHA)).rejects.toThrow();
    expect(trades()).toEqual([TRADE_A, TRADE_A2, TRADE_B]);
  });
});
