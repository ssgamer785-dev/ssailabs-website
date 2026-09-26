import { afterAll, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { asyncRoute, deleteObjects } from './r2';

/**
 * Regression cover for the crash found while testing the quota purge.
 *
 * Express 4 does not await a route handler, so a rejected promise becomes an
 * unhandled rejection and Node exits. A DeleteObjects answering 503 during a
 * purge was enough to take the whole server down — which also meant the two
 * phases of the purge (delete from R2, then mark the rows) could not report a
 * failure to anyone.
 */

const servers: Server[] = [];
afterAll(() => { for (const s of servers) s.close(); });

/** Starts an app on an ephemeral port and returns its base URL. */
async function serve(app: express.Express): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Stands in for S3Client. `errors` are the per-key failures R2 reports. */
const fakeS3 = (opts: { throws?: Error; errors?: { Key: string; Code: string; Message: string }[] } = {}) => {
  const calls: unknown[] = [];
  return {
    calls,
    send: async (command: unknown) => {
      calls.push(command);
      if (opts.throws) throw opts.throws;
      return { Errors: opts.errors ?? [], Deleted: [] };
    },
  };
};

describe('deleteObjects: a failed R2 delete must not read as success', () => {
  test('no keys is a no-op and never calls R2', async () => {
    const s3 = fakeS3();
    await deleteObjects(s3 as never, 'bucket', []);
    expect(s3.calls.length).toBe(0);
  });

  test('a clean delete resolves and does call R2', async () => {
    const s3 = fakeS3();
    await deleteObjects(s3 as never, 'bucket', [{ Key: 'chat/a/1.bin' }]);
    expect(s3.calls.length).toBe(1);
  });

  test('a transport failure propagates', async () => {
    const s3 = fakeS3({ throws: new Error('503 from R2') });
    await expect(deleteObjects(s3 as never, 'bucket', [{ Key: 'chat/a/1.bin' }])).rejects.toThrow('503 from R2');
  });

  test('a PARTIAL failure throws, although R2 answered 200', async () => {
    // Quiet mode returns only the keys that failed; the call itself succeeds.
    const s3 = fakeS3({ errors: [{ Key: 'chat/a/2.bin', Code: 'InternalError', Message: 'try again' }] });
    await expect(
      deleteObjects(s3 as never, 'bucket', [{ Key: 'chat/a/1.bin' }, { Key: 'chat/a/2.bin' }]),
    ).rejects.toThrow(/1 of 2 object\(s\)/);
  });

  test('the thrown message names the object and the reason', async () => {
    const s3 = fakeS3({ errors: [{ Key: 'chat/a/2.bin', Code: 'AccessDenied', Message: 'nope' }] });
    await expect(deleteObjects(s3 as never, 'bucket', [{ Key: 'chat/a/2.bin' }]))
      .rejects.toThrow(/chat\/a\/2\.bin.*AccessDenied.*nope/);
  });
});

describe('the two-phase purge contract holds when R2 fails', () => {
  /** The shape makeRoom() and delete-media use: R2 first, database second. */
  async function purge(s3: ReturnType<typeof fakeS3>, markPurged: () => void) {
    await deleteObjects(s3 as never, 'bucket', [{ Key: 'chat/a/1.bin' }]);
    markPurged();
  }

  test('rows are NOT marked purged when the delete throws', async () => {
    let marked = false;
    const s3 = fakeS3({ throws: new Error('R2 unavailable') });
    await expect(purge(s3, () => { marked = true; })).rejects.toThrow('R2 unavailable');
    expect(marked).toBe(false);
  });

  test('rows are NOT marked purged when the delete only partly succeeds', async () => {
    let marked = false;
    const s3 = fakeS3({ errors: [{ Key: 'chat/a/1.bin', Code: 'InternalError', Message: 'x' }] });
    await expect(purge(s3, () => { marked = true; })).rejects.toThrow();
    expect(marked).toBe(false);
  });

  test('rows ARE marked purged once the objects are genuinely gone', async () => {
    let marked = false;
    await purge(fakeS3(), () => { marked = true; });
    expect(marked).toBe(true);
  });
});

describe('asyncRoute: a rejecting handler is contained', () => {
  test('a rejection becomes a controlled 503 instead of an unhandled rejection', async () => {
    const app = express();
    app.get('/boom', asyncRoute(async () => { throw new Error('R2 DeleteObjects failed'); }));
    const base = await serve(app);

    const res = await fetch(`${base}/boom`);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/temporarily unavailable/i);
    // The reason is logged, not returned — no internals leak to the caller.
    expect(JSON.stringify(body)).not.toContain('DeleteObjects');
  });

  test('the server keeps serving after a failure, and repeat failures stay contained', async () => {
    let succeedNext = false;
    const app = express();
    app.get('/quota', asyncRoute(async (_req, res) => {
      if (!succeedNext) throw new Error('R2 unavailable');
      res.json({ ok: true });
    }));
    app.get('/health', asyncRoute(async (_req, res) => { res.json({ alive: true }); }));
    const base = await serve(app);

    // three consecutive failures
    for (let i = 0; i < 3; i++) {
      expect((await fetch(`${base}/quota`)).status).toBe(503);
    }
    // an unrelated route is unaffected
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ alive: true });

    // and the same route recovers once R2 does
    succeedNext = true;
    const ok = await fetch(`${base}/quota`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });

  test('a successful handler is completely unaffected', async () => {
    const app = express();
    app.get('/fine', asyncRoute(async (_req, res) => { res.status(201).json({ uploadUrl: 'https://signed' }); }));
    const base = await serve(app);

    const res = await fetch(`${base}/fine`);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ uploadUrl: 'https://signed' });
  });

  test('a handler that already sent headers is not double-written', async () => {
    const app = express();
    app.get('/late', asyncRoute(async (_req, res) => {
      res.status(200).json({ partial: true });
      throw new Error('failed after responding');
    }));
    const base = await serve(app);

    const res = await fetch(`${base}/late`);
    // The original response stands; the error goes to Express, not on top of it.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partial: true });
  });
});
