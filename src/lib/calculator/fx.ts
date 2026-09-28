/**
 * Client side of the Risk Calculator's FX rates.
 *
 * Always through the server, never straight to the provider — the server is
 * what caches the fetch and is the only place a timeout or malformed response
 * needs handling once. This returns null on any failure (network, non-2xx,
 * unexpected shape) rather than throwing, so the calculator can show one
 * honest "unavailable" state instead of a stack trace.
 */
export async function fetchUsdRates(): Promise<Record<string, number> | null> {
  return (await fetchFxRates())?.rates ?? null;
}

/** A rate this much older than now is flagged as stale: the provider publishes once a day. */
export const FX_RATE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * The rates with the time the provider published them (null when it did not
 * say), so a result can show how old its conversion rate is.
 */
export async function fetchFxRates(): Promise<{ rates: Record<string, number>; updatedAt: string | null } | null> {
  try {
    const res = await fetch('/api/fx/rates');
    if (!res.ok) return null;

    const body = await res.json();
    const rates = body?.rates;
    if (!rates || typeof rates !== 'object') return null;

    const updatedAt = typeof body.updatedAt === 'string' && Number.isFinite(Date.parse(body.updatedAt)) ? body.updatedAt : null;
    return { rates: rates as Record<string, number>, updatedAt };
  } catch {
    return null;
  }
}
