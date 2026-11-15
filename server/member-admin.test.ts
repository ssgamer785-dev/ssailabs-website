import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { memberAdminRouter } from './member-admin';
import { resetClientsForTests } from './r2';

/**
 * Deleting a member, through the real route, against a stand-in for Supabase
 * (Auth token checks, the profiles read, the admin_delete_member RPC, the Auth
 * admin delete, and the audit log).
 */
const ADMIN = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333333';
const TOKENS: Record<string, string> = { 'admin-token': ADMIN, 'student-token': STUDENT };

const servers: Server[] = [];
const envKeys = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeys) savedEnv[key] = process.env[key];

interface Fake {
  rpc: Record<string, unknown>[];
  authDeletes: { id: string; soft: unknown }[];
  audit: Record<string, unknown>[];
  /** What admin_delete_member answers next (a queue; the last one repeats). */
  rpcAnswers: unknown[];
  /** HTTP status the Auth admin delete answers next (a queue; the last one repeats). */
  authAnswers: number[];
  rpcMissing: boolean;
}

let fake: Fake;
let base: string;

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  fake = { rpc: [], authDeletes: [], audit: [], rpcAnswers: [{ ok: true, already: false, avatar_key: null, counts: { devices: 1 } }], authAnswers: [200], rpcMissing: false };
  const supa = express();
  supa.use(express.json());
  supa.get('/auth/v1/user', (req, res) => {
    const id = TOKENS[req.get('authorization')?.replace(/^Bearer /, '') ?? ''];
    if (!id) return res.status(401).json({ message: 'invalid JWT' });
    return res.json({ id, aud: 'authenticated', email: `${id}@example.test`, app_metadata: {}, user_metadata: {} });
  });
  supa.get('/rest/v1/profiles', (req, res) => {
    const id = new URL(req.originalUrl, 'http://fake').searchParams.get('id')?.replace(/^eq\./, '');
    return res.set('Content-Type', 'application/vnd.pgrst.object+json')
      .json({ role: id === ADMIN ? 'admin' : 'student', activated_at: '2026-01-01T00:00:00Z' });
  });
  supa.post('/rest/v1/rpc/admin_delete_member', (req, res) => {
    fake.rpc.push(req.body);
    if (fake.rpcMissing) return res.status(404).json({ code: 'PGRST202', message: 'Could not find the function public.admin_delete_member' });
    const answer = fake.rpcAnswers.length > 1 ? fake.rpcAnswers.shift() : fake.rpcAnswers[0];
    return res.json(answer);
  });
  supa.delete('/auth/v1/admin/users/:id', (req, res) => {
    fake.authDeletes.push({ id: req.params.id, soft: req.body?.should_soft_delete });
    const status = fake.authAnswers.length > 1 ? fake.authAnswers.shift()! : fake.authAnswers[0];
    if (status === 200) return res.json({ id: req.params.id, aud: 'authenticated', app_metadata: {}, user_metadata: {} });
    return res.status(status).json({ code: status, msg: status === 404 ? 'User not found' : 'Database error deleting user' });
  });
  supa.post('/rest/v1/admin_audit_events', (req, res) => { fake.audit.push(req.body); return res.status(201).json([]); });
  const url = await listen(supa);
  Object.assign(process.env, { SUPABASE_URL: url, VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture' });
  resetClientsForTests();

  const app = express();
  app.use(express.json());
  app.use('/api/admin/members', memberAdminRouter());
  base = await listen(app);
});

afterEach(() => {
  while (servers.length) servers.pop()!.close();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetClientsForTests();
});
afterAll(() => resetClientsForTests());

async function remove(id: string, token: string | null, body: unknown = { confirm: 'DELETE' }) {
  const res = await fetch(`${base}/api/admin/members/${id}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, unknown> };
}

describe('who may delete a member', () => {
  test('nobody signed in, and no student, can delete anyone; the database is never asked', async () => {
    expect((await remove(TARGET, null)).status).toBe(401);
    expect((await remove(TARGET, 'bad-token')).status).toBe(401);
    expect((await remove(TARGET, 'student-token')).status).toBe(403);
    expect(fake.rpc).toHaveLength(0);
    expect(fake.authDeletes).toHaveLength(0);
  });

  test('the admin must send the typed confirmation, a real member id, and not their own', async () => {
    expect((await remove(TARGET, 'admin-token', {})).status).toBe(400);
    expect((await remove(TARGET, 'admin-token', { confirm: 'delete' })).status).toBe(400);
    expect((await remove('not-a-uuid', 'admin-token')).status).toBe(400);
    const self = await remove(ADMIN, 'admin-token');
    expect(self.status).toBe(409);
    expect(self.body.error).toContain('your own account');
    expect(fake.rpc).toHaveLength(0);
  });

  test('the database\'s own refusals come back as the right answers, and nothing is deleted from Auth', async () => {
    fake.rpcAnswers = [{ ok: false, reason: 'not_found' }, { ok: false, reason: 'last_admin' }, { ok: false, reason: 'not_admin' }];
    expect((await remove(TARGET, 'admin-token')).status).toBe(404);
    const last = await remove(TARGET, 'admin-token');
    expect(last.status).toBe(409);
    expect(last.body.error).toContain('last admin');
    expect((await remove(TARGET, 'admin-token')).status).toBe(403);
    expect(fake.authDeletes).toHaveLength(0);
  });
});

describe('deleting a member', () => {
  test('closes the account in the database as the verified admin, then soft-deletes the sign-in, and records it', async () => {
    const res = await remove(TARGET, 'admin-token');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, already: false });
    // The actor is the verified caller, never something the browser could choose.
    expect(fake.rpc).toEqual([{ p_actor: ADMIN, p_target: TARGET }]);
    // Soft delete: sessions revoked, email and password removed, the row kept (no cascade into posts and chats).
    expect(fake.authDeletes).toEqual([{ id: TARGET, soft: true }]);
    expect(fake.audit).toEqual([{ actor_id: ADMIN, action: 'member_sign_in_closed', target_id: TARGET, details: {} }]);
  });

  test('when closing the sign-in fails, says so, records it, and a second press finishes the job', async () => {
    fake.authAnswers = [500, 200];
    fake.rpcAnswers = [{ ok: true, already: false, avatar_key: null }, { ok: true, already: true }];
    const first = await remove(TARGET, 'admin-token');
    expect(first.status).toBe(502);
    expect(first.body).toMatchObject({ stage: 'sign-in', removedFromApp: true });
    expect(fake.audit[0]).toMatchObject({ action: 'member_sign_in_close_failed', target_id: TARGET });
    const again = await remove(TARGET, 'admin-token');
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ ok: true, already: true });
    expect(fake.authDeletes.map(d => d.soft)).toEqual([true, true]);
  });

  test('a sign-in Auth no longer knows counts as closed', async () => {
    fake.authAnswers = [404];
    expect((await remove(TARGET, 'admin-token')).status).toBe(200);
  });

  test('before the database update, says what is missing instead of failing vaguely', async () => {
    fake.rpcMissing = true;
    const res = await remove(TARGET, 'admin-token');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('database update');
    expect(fake.authDeletes).toHaveLength(0);
  });
});
