import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fxRouter, getUsdRates, parseRates, resetFxCacheForTests } from './fx';

/**
 * The FX rate endpoint the Risk Calculator's cross-currency conversion
 * depends on. Never talks to the real provider here — every case below mocks
 * globalThis.fetch, which is what getUsdRates() actually calls.
 */

const servers: Server[] = [];
afterAll(() => { for (const s of servers) s.close(); });

async function serve(): Promise<string> {
  const app = express();
  app.use('/api/fx', fxRouter());
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetFxCacheForTests();
  fetchCalls = 0;
});

/** A response shaped like the real provider's, but with a labelled example rate. */
function providerResponse(rates: Record<string, unknown>, result: string | undefined = 'success') {
  return new Response(JSON.stringify({ result, base_code: 'USD', rates }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchCalls = 0;

/**
 * Intercepts only the outbound call to the FX provider. This has to check the
 * URL rather than replace globalThis.fetch unconditionally: the test's own
 * `fetch(base + '/api/fx/rates')` against the local Express server uses the
 * exact same global, and an unconditional mock silently answered THAT call
 * too — instead of a real round trip through the router, every assertion was
 * reading the mock's own canned response straight back.
 */
function mockProviderFetch(respond: () => Response | Promise<Response>) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('open.er-api.com')) {
      fetchCalls++;
      return respond();
    }
    return realFetch(url as string, init);
  }) as typeof fetch;
}

function mockFetchOnce(response: Response | (() => Response) | (() => Promise<Response>)) {
  mockProviderFetch(() => (typeof response === 'function' ? response() : response));
}

describe('parseRates: only a genuine success shape is accepted', () => {
  test('accepts a real-shaped response', () => {
    expect(parseRates({ result: 'success', rates: { EUR: 0.9, GBP: 0.78 } }))
      .toEqual({ EUR: 0.9, GBP: 0.78 });
  });
  test('rejects result !== "success"', () => {
    expect(parseRates({ result: 'error', rates: { EUR: 0.9 } })).toBeNull();
  });
  test('rejects a missing rates object', () => {
    expect(parseRates({ result: 'success' })).toBeNull();
  });
  test('rejects rates that is not an object', () => {
    expect(parseRates({ result: 'success', rates: 'nope' })).toBeNull();
  });
  test('drops a non-numeric entry rather than rejecting the whole map', () => {
    expect(parseRates({ result: 'success', rates: { EUR: 0.9, GBP: 'bad' } }))
      .toEqual({ EUR: 0.9 });
  });
  test('drops a zero or negative entry', () => {
    expect(parseRates({ result: 'success', rates: { EUR: 0, GBP: -0.5, INR: 83 } }))
      .toEqual({ INR: 83 });
  });
  test('drops a non-finite entry', () => {
    expect(parseRates({ result: 'success', rates: { EUR: Number.NaN, INR: 83 } }))
      .toEqual({ INR: 83 });
  });
  test('rejects an all-invalid map (nothing usable came through)', () => {
    expect(parseRates({ result: 'success', rates: { EUR: 'bad', GBP: 0 } })).toBeNull();
  });
  test('rejects a non-object body entirely', () => {
    expect(parseRates(null)).toBeNull();
    expect(parseRates('nope')).toBeNull();
  });
});

describe('getUsdRates: caching', () => {
  test('a second call within the cache window does not refetch', async () => {
    mockFetchOnce(providerResponse({ EUR: 0.9 }));
    const first = await getUsdRates();
    const second = await getUsdRates();
    expect(first).toEqual({ EUR: 0.9 });
    expect(second).toEqual({ EUR: 0.9 });
    expect(fetchCalls).toBe(1);
  });

  test('resetFxCacheForTests() forces a real refetch', async () => {
    mockFetchOnce(providerResponse({ EUR: 0.9 }));
    await getUsdRates();
    resetFxCacheForTests();
    mockFetchOnce(providerResponse({ EUR: 0.91 }));
    const after = await getUsdRates();
    expect(after).toEqual({ EUR: 0.91 });
    expect(fetchCalls).toBe(2);
  });
});

describe('getUsdRates: provider failure', () => {
  test('a non-2xx response is treated as a failure, not empty rates', async () => {
    mockProviderFetch(() => new Response('', { status: 500 }));
    await expect(getUsdRates()).rejects.toThrow();
  });

  test('a network error propagates rather than returning a cached-empty map', async () => {
    mockProviderFetch(() => { throw new Error('network down'); });
    await expect(getUsdRates()).rejects.toThrow('network down');
  });

  test('a malformed body (missing rates) is refused', async () => {
    mockFetchOnce(providerResponse(undefined as unknown as Record<string, unknown>, 'success'));
    await expect(getUsdRates()).rejects.toThrow();
  });

  test('a failed fetch does not poison the cache for the next attempt', async () => {
    mockProviderFetch(() => { throw new Error('down'); });
    await expect(getUsdRates()).rejects.toThrow();

    mockFetchOnce(providerResponse({ EUR: 0.9 }));
    const recovered = await getUsdRates();
    expect(recovered).toEqual({ EUR: 0.9 });
  });
});

describe('GET /api/fx/rates', () => {
  test('returns the cached USD-based rates', async () => {
    mockFetchOnce(providerResponse({ EUR: 0.9, GBP: 0.78, INR: 83.5, JPY: 149.2 }));
    const base = await serve();
    const res = await fetch(`${base}/api/fx/rates`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.base).toBe('USD');
    expect(body.rates.GBP).toBe(0.78);
    expect(body.rates.INR).toBe(83.5);
  });

  test('answers 503 with an honest message when the provider is unavailable, never a fake rate', async () => {
    mockProviderFetch(() => new Response('', { status: 500 }));
    const base = await serve();
    const res = await fetch(`${base}/api/fx/rates`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.rates).toBeUndefined();
  });

  test('a request while the provider is down does not crash the server for the next request', async () => {
    mockProviderFetch(() => { throw new Error('down'); });
    const base = await serve();
    const first = await fetch(`${base}/api/fx/rates`);
    expect(first.status).toBe(503);

    mockFetchOnce(providerResponse({ EUR: 0.9 }));
    const second = await fetch(`${base}/api/fx/rates`);
    expect(second.status).toBe(200);
  });
});
