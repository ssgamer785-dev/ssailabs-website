/**
 * Server-side FX rates for the Risk Calculator.
 *
 * The provider (open.er-api.com) is a free, keyless, USD-based daily
 * snapshot — not live market pricing, and the calculator must never present
 * it as such. It is fetched here, cached, and never called from the browser:
 * there is nothing for a client to authenticate with anyway, and every open
 * calculator tab hitting the provider on its own would be both pointless and
 * unfriendly to a free public endpoint. The server fetches once per cache
 * window and every calculator interaction reads the cache.
 */

import { Router, type Response } from 'express';
import { asyncRoute } from './r2.js';

const FX_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';

/**
 * The provider's own `time_next_update_utc` refreshes roughly once every 24
 * hours — this is daily data, not a tick feed. A 6-hour cache keeps this
 * server well inside that cadence (never more than 6 hours behind whatever
 * the provider last published) without hitting a free public endpoint on
 * every button press in the calculator.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

interface FxCache { rates: Record<string, number>; fetchedAt: number }
let cache: FxCache | null = null;

/** Only for tests: a fresh module would otherwise carry state between them. */
export function resetFxCacheForTests(): void {
  cache = null;
}

/**
 * Pulls out just the shape this app needs, rather than trusting or forwarding
 * the whole provider response (which also carries documentation links and
 * terms-of-use text no caller here has any business asserting on).
 *
 * Returns null for anything that is not a genuine `{ result: 'success',
 * rates: { CODE: number, ... } }` body — a malformed or missing rate must
 * never silently become a wrong exchange rate.
 */
export function parseRates(body: unknown): Record<string, number> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.result !== 'success') return null;

  const rates = b.rates;
  if (!rates || typeof rates !== 'object') return null;

  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[code] = value;
  }
  // USD is the provider's own base and is never a key in its rates object;
  // the calculator treats USD as an implicit 1, so its absence here is not a
  // sign of a malformed response.
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Cached USD-based rates: `{ EUR: 0.87, GBP: 0.75, INR: 95.6, ... }` meaning
 * 1 USD buys that many units of the currency. Refetches only once the cache
 * has gone stale; throws on any failure so the caller can answer honestly
 * rather than serve a stale or invented rate.
 */
export async function getUsdRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FX_SOURCE_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`FX provider responded ${res.status}`);

    const rates = parseRates(await res.json());
    if (!rates) throw new Error('FX provider returned an unexpected response shape');

    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } finally {
    clearTimeout(timer);
  }
}

export function fxRouter(): Router {
  const router = Router();

  /**
   * USD-based rates for every currency the provider carries. The calculator
   * only needs the handful of deposit currencies it offers, but there is no
   * benefit to filtering server-side — the whole map is a few hundred bytes
   * and this keeps the endpoint from needing to know the calculator's list.
   */
  router.get('/rates', asyncRoute(async (_req, res: Response) => {
    try {
      const rates = await getUsdRates();
      res.json({ base: 'USD', rates });
    } catch (error) {
      // The failure is logged in full server-side; the caller gets an honest
      // "unavailable" rather than a stale or guessed rate.
      console.error('[fx] could not obtain exchange rates:', error);
      res.status(503).json({ error: 'Exchange rates are temporarily unavailable. Please try again.' });
    }
  }));

  return router;
}
