import { afterAll, describe, expect, test } from 'bun:test';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import app from './app';

let server: Server;
const base = new Promise<string>(resolve => {
  server = app.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
});
afterAll(() => { server.close(); });

describe('API surface', () => {
  test('does not serve contact-form leads to unauthenticated callers', async () => {
    const res = await fetch(`${await base}/api/leads`);
    expect(res.status).toBe(404);
  });

  test('does not accept anonymous contact-form submissions that send email', async () => {
    const res = await fetch(`${await base}/api/start-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', email: 'x@example.test', phone: '1' }),
    });
    expect(res.status).toBe(404);
  });

  test('still routes the app endpoints', async () => {
    const res = await fetch(`${await base}/api/notifications`, { method: 'DELETE' });
    expect(res.status).not.toBe(404);
  });
});
