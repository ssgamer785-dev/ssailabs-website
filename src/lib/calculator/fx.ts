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
  try {
    const res = await fetch('/api/fx/rates');
    if (!res.ok) return null;

    const body = await res.json();
    const rates = body?.rates;
    if (!rates || typeof rates !== 'object') return null;

    return rates as Record<string, number>;
  } catch {
    return null;
  }
}
