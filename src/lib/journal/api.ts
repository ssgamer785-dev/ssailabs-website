import { supabase } from '../supabase';
import {
  fromRow, parseSummary, rangeDates, type JournalSummary, type JournalTrade, type JournalTradeRow, type RangeKey, type TradeResult, type TradeValues,
} from './model';

/**
 * The Trading Journal's reads and writes. Rows go straight to Supabase, where
 * row-level security keeps every journal to its owner; pictures go through the
 * app server (server/journal-media.ts), which signs uploads into the caller's
 * own namespace and reads only for the caller's own trades.
 */

const LIST_COLUMNS = 'id, trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency, strategy, mistakes, followed_plan, notes, '
  + 'screenshot_key, screenshot_mime, screenshot_width, screenshot_height, created_at, updated_at';

/** The journal's database update has not been applied yet: the screens say so instead of failing. */
export class JournalUnavailableError extends Error {
  constructor() { super('The Trading Journal needs the latest database update. Please try again later.'); this.name = 'JournalUnavailableError'; }
}

function isMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')
    || /journal_(trades|summary)/.test(error.message ?? '') && /does not exist|schema cache|could not find/i.test(error.message ?? '');
}

function fail(error: { code?: string; message?: string }, fallback: string): never {
  if (isMissing(error)) throw new JournalUnavailableError();
  // 23514: a database rule refused the values (the form checks the same rules first).
  if (error.code === '23514') throw new Error('Some details are not valid. Check the highlighted fields and try again.');
  if (error.code === '42501') throw new Error('You can only change your own journal.');
  throw new Error(fallback);
}

export const PAGE_SIZE = 30;

export async function listTrades(userId: string, filter: { range: RangeKey; result: TradeResult | 'all'; offset: number; today?: Date }): Promise<{ trades: JournalTrade[]; hasMore: boolean }> {
  const { from, to } = rangeDates(filter.range, filter.today);
  // Own trades only (RLS also guarantees it).
  let query = supabase.from('journal_trades').select(LIST_COLUMNS).eq('user_id', userId);
  if (from) query = query.gte('trade_date', from);
  if (to) query = query.lte('trade_date', to);
  if (filter.result !== 'all') query = query.eq('result', filter.result);
  const { data, error } = await query
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(filter.offset, filter.offset + PAGE_SIZE); // one extra row says whether there is more
  if (error) fail(error, 'Could not load your journal. Pull down to try again.');
  const rows = (data ?? []) as unknown as JournalTradeRow[];
  return { trades: rows.slice(0, PAGE_SIZE).map(fromRow), hasMore: rows.length > PAGE_SIZE };
}

export async function getSummary(): Promise<JournalSummary> {
  const { data, error } = await supabase.rpc('journal_summary');
  if (error) fail(error, 'Could not load your journal figures.');
  return parseSummary(data);
}

export async function getTrade(id: string): Promise<JournalTrade | null> {
  const { data, error } = await supabase.from('journal_trades').select(LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load this trade.');
  return data ? fromRow(data as unknown as JournalTradeRow) : null;
}

/** The symbols and strategies the member has used most recently, for the form's suggestions. */
export async function recentChoices(userId: string): Promise<{ symbols: string[]; strategies: string[] }> {
  const { data, error } = await supabase.from('journal_trades').select('symbol, strategy').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) return { symbols: [], strategies: [] };
  const rows = (data ?? []) as { symbol: string; strategy: string | null }[];
  return {
    symbols: [...new Set(rows.map(r => r.symbol))].slice(0, 12),
    strategies: [...new Set(rows.map(r => r.strategy).filter((s): s is string => !!s))].slice(0, 8),
  };
}

export interface ScreenshotFields { screenshot_key: string | null; screenshot_mime: string | null; screenshot_width: number | null; screenshot_height: number | null }

export async function createTrade(values: TradeValues & ScreenshotFields): Promise<JournalTrade> {
  const { data, error } = await supabase.from('journal_trades').insert(values).select(LIST_COLUMNS).single();
  if (error) fail(error, 'Could not save the trade. Your entries are still here — try again.');
  return fromRow(data as unknown as JournalTradeRow);
}

export async function updateTrade(id: string, values: TradeValues & ScreenshotFields): Promise<JournalTrade> {
  const { data, error } = await supabase.from('journal_trades').update(values).eq('id', id).select(LIST_COLUMNS).maybeSingle();
  if (error) fail(error, 'Could not save your changes. They are still here — try again.');
  if (!data) throw new Error('This trade no longer exists.');
  return fromRow(data as unknown as JournalTradeRow);
}

// ---------------------------------------------------------------------------------------------------------------
// Pictures, through the app server
// ---------------------------------------------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Please log in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try { const body = await res.json(); return typeof body?.error === 'string' ? body.error : fallback; } catch { return fallback; }
}

export async function requestScreenshotUpload(file: Blob): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await fetch('/api/journal/upload-url', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start the screenshot upload.'));
  return res.json();
}

/** XHR rather than fetch: upload progress. */
export function uploadScreenshot(uploadUrl: string, file: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); } else reject(new Error(`The screenshot upload failed (${xhr.status}). Try again.`)); };
    xhr.onerror = () => reject(new Error('The screenshot upload failed — check your connection and try again.'));
    xhr.send(file);
  });
}

/** Removes uploads no trade uses (a replaced picture, an unsaved form). Best effort: the server keeps any picture a trade still shows. */
export async function discardScreenshots(keys: (string | null | undefined)[]): Promise<void> {
  const list = [...new Set(keys.filter((k): k is string => !!k))];
  if (!list.length) return;
  try {
    await fetch('/api/journal/discard', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ keys: list }), keepalive: true });
  } catch { /* Left for a later clean-up; never blocks the member. */ }
}

const urlCache = new Map<string, { url: string; until: number }>();

/** A short-lived signed address for a trade's screenshot (the caller's own trades only). */
export async function screenshotUrl(tradeId: string, key: string, force = false): Promise<string> {
  const cacheKey = `${tradeId}:${key}`;
  const cached = urlCache.get(cacheKey);
  if (!force && cached && cached.until > Date.now()) return cached.url;
  const res = await fetch(`/api/journal/screenshot-url?trade=${encodeURIComponent(tradeId)}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await readError(res, 'Could not load the screenshot.'));
  const body = await res.json() as { url: string; expiresIn: number };
  urlCache.set(cacheKey, { url: body.url, until: Date.now() + Math.max(0, body.expiresIn - 60) * 1000 });
  return body.url;
}

export async function deleteTrade(id: string): Promise<void> {
  const res = await fetch(`/api/journal/trades/${encodeURIComponent(id)}/delete`, { method: 'POST', headers: await authHeaders(), body: '{}' });
  if (res.ok || res.status === 404) return; // gone either way
  throw new Error(await readError(res, 'Could not delete the trade. Try again.'));
}
