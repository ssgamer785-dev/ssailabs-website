/**
 * Trading Journal: the shape of a trade, how what a member types becomes one,
 * and how the journal's figures are worded. Pure functions, so every rule here
 * is unit-tested without a browser or a database. The database enforces the
 * same limits again (20261116090000_trading_journal.sql); these exist so the
 * member hears about a problem next to the field, before saving.
 */

export type Direction = 'buy' | 'sell';
export type TradeResult = 'profit' | 'loss' | 'breakeven';

export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'AED', 'USDT'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** The mistakes a member can tag (stored as these ids), in the order the form offers them. */
export const MISTAKES = [
  ['early_entry', 'Early entry'],
  ['late_entry', 'Late entry'],
  ['no_confirmation', 'No confirmation'],
  ['overtrading', 'Overtrading'],
  ['fomo', 'FOMO'],
  ['revenge_trade', 'Revenge trade'],
  ['moved_stop_loss', 'Moved stop loss'],
  ['no_stop_loss', 'No stop loss'],
  ['exited_early', 'Exited too early'],
  ['held_too_long', 'Held too long'],
  ['oversized_position', 'Position too big'],
  ['ignored_plan', 'Ignored my plan'],
  ['emotional', 'Emotional decision'],
  ['other', 'Other'],
] as const;
export type MistakeTag = (typeof MISTAKES)[number][0];
const MISTAKE_LABEL = new Map<string, string>(MISTAKES);
export function mistakeLabel(tag: string): string { return MISTAKE_LABEL.get(tag) ?? tag; }

export const SYMBOL_MAX = 24;
export const STRATEGY_MAX = 80;
export const NOTES_MAX = 2000;
export const RR_MAX = 1000;
export const AMOUNT_MAX = 999_999_999_999;
export const SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

export interface Screenshot { key: string; mime: string; width: number | null; height: number | null }

export interface JournalTrade {
  id: string;
  tradeDate: string;          // YYYY-MM-DD, the member's own calendar date
  symbol: string;
  direction: Direction;
  riskReward: number;         // reward per 1 of risk
  result: TradeResult;
  pnlAmount: number | null;   // signed
  pnlCurrency: Currency | null;
  strategy: string | null;
  mistakes: MistakeTag[];
  followedPlan: boolean | null;
  notes: string | null;
  screenshot: Screenshot | null;
  createdAt: string;
  updatedAt: string;
}

/** A row as the database returns it. */
export interface JournalTradeRow {
  id: string; trade_date: string; symbol: string; direction: string; risk_reward: number | string; result: string;
  pnl_amount: number | string | null; pnl_currency: string | null; strategy: string | null; mistakes: string[] | null;
  followed_plan: boolean | null; notes: string | null; screenshot_key: string | null; screenshot_mime: string | null;
  screenshot_width: number | null; screenshot_height: number | null; created_at: string; updated_at: string;
}

export function fromRow(row: JournalTradeRow): JournalTrade {
  const amount = row.pnl_amount === null || row.pnl_amount === undefined ? null : Number(row.pnl_amount);
  return {
    id: row.id,
    tradeDate: row.trade_date,
    symbol: row.symbol,
    direction: row.direction === 'sell' ? 'sell' : 'buy',
    riskReward: Number(row.risk_reward),
    result: row.result === 'loss' ? 'loss' : row.result === 'breakeven' ? 'breakeven' : 'profit',
    pnlAmount: amount !== null && Number.isFinite(amount) ? amount : null,
    pnlCurrency: (CURRENCIES as readonly string[]).includes(row.pnl_currency ?? '') ? row.pnl_currency as Currency : null,
    strategy: row.strategy,
    mistakes: (row.mistakes ?? []).filter((tag): tag is MistakeTag => MISTAKE_LABEL.has(tag)),
    followedPlan: row.followed_plan,
    notes: row.notes,
    screenshot: row.screenshot_key ? { key: row.screenshot_key, mime: row.screenshot_mime ?? 'image/jpeg', width: row.screenshot_width, height: row.screenshot_height } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Dates (always the member's local calendar, never UTC: a trade on the 1st late at night is still the 1st)
// ---------------------------------------------------------------------------------------------------------------

export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.getFullYear() === Number(m[1]) && date.getMonth() === Number(m[2]) - 1 && date.getDate() === Number(m[3]) ? date : null;
}

/** "12 Nov" this year, "12 Nov 2025" otherwise. */
export function shortDate(value: string, today: Date = new Date()): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Thu, 12 Nov 2026". */
export function longDate(value: string): string {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : value;
}

export type RangeKey = 'month' | 'last_month' | 'three_months' | 'year' | 'all';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'three_months', label: 'Last 3 Months' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

/** The first and last calendar day a range covers (inclusive), or nulls for all time. */
export function rangeDates(key: RangeKey, today: Date = new Date()): { from: string | null; to: string | null } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = (yy: number, mm: number, dd: number) => localDateString(new Date(yy, mm, dd));
  switch (key) {
    case 'month': return { from: day(y, m, 1), to: day(y, m + 1, 0) };
    case 'last_month': return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case 'three_months': return { from: day(y, m - 2, 1), to: day(y, m + 1, 0) };
    case 'year': return { from: day(y, 0, 1), to: day(y, 11, 31) };
    case 'all': return { from: null, to: null };
  }
}

/** The narrowest range that still shows a trade on `tradeDate` (so a just-saved trade is on screen). */
export function rangeShowing(tradeDate: string, current: RangeKey, today: Date = new Date()): RangeKey {
  const inside = (key: RangeKey) => { const { from, to } = rangeDates(key, today); return (!from || tradeDate >= from) && (!to || tradeDate <= to); };
  if (inside(current)) return current;
  return (['month', 'last_month', 'three_months', 'year'] as RangeKey[]).find(inside) ?? 'all';
}

// ---------------------------------------------------------------------------------------------------------------
// Numbers and money
// ---------------------------------------------------------------------------------------------------------------

/** "1:2", "1:2.5", "1:0.75". */
export function formatRiskReward(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `1:${Number(value.toFixed(2))}`;
}

/**
 * What the member typed for R:R, as the reward per 1 of risk. Accepts "2",
 * "2.5", "1:2", "1 : 2.5", "1/3"; a ratio not written per 1 of risk ("2:5") is
 * divided out (2.5). Null when it is not a positive number.
 */
export function parseRiskReward(input: string): number | null {
  const text = input.trim().replace(/,/g, '.');
  if (!text) return null;
  const ratio = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(text);
  const value = ratio ? Number(ratio[2]) / Number(ratio[1]) : /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** A money amount as typed (no sign: the result decides it). Null when empty; NaN when not a number. */
export function parseAmount(input: string): number | null {
  const text = input.trim().replace(/[,\s]/g, '');
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  return Number(text);
}

const SYMBOL: Record<Currency, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', AED: 'AED ', USDT: '' };
export function currencySymbol(currency: Currency): string { return SYMBOL[currency] || `${currency} `; }

/** "+$2,450", "-₹1,20,000", "$0", "+250.50 USDT". Signed unless zero. */
export function formatMoney(amount: number, currency: Currency): string {
  const abs = Math.abs(amount);
  const digits = Number.isInteger(abs) ? 0 : 2;
  const number = abs.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return currency === 'USDT' ? `${sign}${number} USDT` : `${sign}${SYMBOL[currency]}${number}`;
}

export function normalizeSymbol(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase();
}


// ---------------------------------------------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------------------------------------------

export interface TradeDraft {
  tradeDate: string;
  symbol: string;
  direction: Direction | null;
  riskReward: string;
  result: TradeResult | null;
  amount: string;
  currency: Currency;
  strategy: string;
  mistakes: MistakeTag[];
  followedPlan: boolean;
  notes: string;
}

export function emptyDraft(currency: Currency = 'USD', today: Date = new Date()): TradeDraft {
  return { tradeDate: localDateString(today), symbol: '', direction: null, riskReward: '', result: null, amount: '', currency,
    strategy: '', mistakes: [], followedPlan: false, notes: '' };
}

export function draftFromTrade(trade: JournalTrade, fallbackCurrency: Currency = 'USD'): TradeDraft {
  return {
    tradeDate: trade.tradeDate, symbol: trade.symbol, direction: trade.direction, riskReward: String(Number(trade.riskReward.toFixed(2))),
    result: trade.result, amount: trade.pnlAmount === null || trade.result === 'breakeven' ? '' : String(Math.abs(trade.pnlAmount)),
    currency: trade.pnlCurrency ?? fallbackCurrency, strategy: trade.strategy ?? '', mistakes: [...trade.mistakes],
    followedPlan: trade.followedPlan === true, notes: trade.notes ?? '',
  };
}

export type DraftField = 'tradeDate' | 'symbol' | 'direction' | 'riskReward' | 'result' | 'amount' | 'strategy' | 'notes';
export type DraftProblems = Partial<Record<DraftField, string>>;

/** What a trade becomes in the database. */
export interface TradeValues {
  trade_date: string; symbol: string; direction: Direction; risk_reward: number; result: TradeResult;
  pnl_amount: number | null; pnl_currency: Currency | null; strategy: string | null; mistakes: MistakeTag[];
  followed_plan: boolean | null; notes: string | null;
}

/** Checks a draft; either the problems to show next to each field, or the values to save. */
export function validateDraft(draft: TradeDraft, today: Date = new Date()): { problems: DraftProblems; values: TradeValues | null } {
  const problems: DraftProblems = {};
  const date = parseLocalDate(draft.tradeDate);
  if (!date) problems.tradeDate = 'Choose the date of the trade.';
  else if (draft.tradeDate > localDateString(today)) problems.tradeDate = 'The date cannot be in the future.';
  else if (draft.tradeDate < '2000-01-01') problems.tradeDate = 'Choose a date from 2000 onwards.';

  const symbol = normalizeSymbol(draft.symbol);
  if (!symbol) problems.symbol = 'Choose the symbol you traded.';
  else if (symbol.length > SYMBOL_MAX) problems.symbol = `A symbol is at most ${SYMBOL_MAX} characters.`;
  else if (!/^[A-Z0-9][A-Z0-9 ._/!&-]*$/.test(symbol)) problems.symbol = 'Use letters, numbers and . / - _ only.';

  if (!draft.direction) problems.direction = 'Choose Buy or Sell.';

  const rr = parseRiskReward(draft.riskReward);
  if (!draft.riskReward.trim()) problems.riskReward = 'Enter the risk : reward, e.g. 1:2.';
  else if (rr === null) problems.riskReward = 'Write it as 1:2 or 2.5 (reward per 1 of risk).';
  else if (rr > RR_MAX) problems.riskReward = `That R:R is above 1:${RR_MAX}.`;

  if (!draft.result) problems.result = 'Choose Profit, Loss or Breakeven.';

  let amount: number | null = null;
  if (draft.result === 'breakeven') amount = 0;
  else {
    const typed = parseAmount(draft.amount);
    if (typed !== null && Number.isNaN(typed)) problems.amount = 'Enter the amount as a number, e.g. 250 or 250.50.';
    else if (typed !== null && typed === 0) problems.amount = draft.result === 'loss' ? 'A loss is more than zero. Choose Breakeven for zero.' : 'A profit is more than zero. Choose Breakeven for zero.';
    else if (typed !== null && typed > AMOUNT_MAX) problems.amount = 'That amount is too large.';
    else if (typed !== null) amount = draft.result === 'loss' ? -typed : typed;
  }

  const strategy = draft.strategy.trim();
  if (strategy.length > STRATEGY_MAX) problems.strategy = `A strategy name is at most ${STRATEGY_MAX} characters.`;
  const notes = draft.notes.trim();
  if (notes.length > NOTES_MAX) problems.notes = `Notes are at most ${NOTES_MAX} characters.`;

  if (Object.keys(problems).length || !draft.direction || !draft.result || rr === null) return { problems, values: null };
  const mistakes = draft.followedPlan ? [] : [...new Set(draft.mistakes)];
  return {
    problems,
    values: {
      trade_date: draft.tradeDate, symbol, direction: draft.direction, risk_reward: rr, result: draft.result,
      pnl_amount: amount, pnl_currency: amount === null ? null : draft.currency,
      strategy: strategy || null, mistakes,
      followed_plan: draft.followedPlan ? true : mistakes.length ? false : null,
      notes: notes || null,
    },
  };
}

/** Whether a picked file can be a screenshot (before it is even looked at). */
export function screenshotProblem(file: { type: string; size: number }): string | null {
  if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type.toLowerCase())) return 'A screenshot must be a JPEG, PNG or WebP image.';
  if (file.size > SCREENSHOT_MAX_BYTES) return 'That image is larger than 10 MB. Try a smaller screenshot.';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The figures (from journal_summary(): counts and averages of what the member recorded, nothing estimated)
// ---------------------------------------------------------------------------------------------------------------

export interface JournalSummary {
  total: number; wins: number; losses: number; breakevens: number;
  averageRr: number | null;
  pnl: { currency: Currency; total: number; trades: number }[];
  bestStrategy: { name: string; trades: number; wins: number } | null;
  topSymbol: { symbol: string; trades: number } | null;
  topMistake: { tag: string; times: number } | null;
  discipline: { answered: number; followed: number };
}

export const EMPTY_SUMMARY: JournalSummary = { total: 0, wins: 0, losses: 0, breakevens: 0, averageRr: null, pnl: [],
  bestStrategy: null, topSymbol: null, topMistake: null, discipline: { answered: 0, followed: 0 } };

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function parseSummary(raw: unknown): JournalSummary {
  if (!raw || typeof raw !== 'object') return EMPTY_SUMMARY;
  const s = raw as Record<string, unknown>;
  const best = s.best_strategy as Record<string, unknown> | null;
  const symbol = s.top_symbol as Record<string, unknown> | null;
  const mistake = s.top_mistake as Record<string, unknown> | null;
  const discipline = (s.discipline ?? {}) as Record<string, unknown>;
  return {
    total: num(s.total), wins: num(s.wins), losses: num(s.losses), breakevens: num(s.breakevens),
    averageRr: s.average_rr === null || s.average_rr === undefined ? null : num(s.average_rr, NaN),
    pnl: (Array.isArray(s.pnl) ? s.pnl : []).filter((p: { currency?: string }) => (CURRENCIES as readonly string[]).includes(p?.currency ?? ''))
      .map((p: { currency: string; total: unknown; trades: unknown }) => ({ currency: p.currency as Currency, total: num(p.total), trades: num(p.trades) })),
    bestStrategy: best && typeof best.name === 'string' ? { name: best.name, trades: num(best.trades), wins: num(best.wins) } : null,
    topSymbol: symbol && typeof symbol.symbol === 'string' ? { symbol: symbol.symbol, trades: num(symbol.trades) } : null,
    topMistake: mistake && typeof mistake.tag === 'string' ? { tag: mistake.tag, times: num(mistake.times) } : null,
    discipline: { answered: num(discipline.answered), followed: num(discipline.followed) },
  };
}

/** "68.4%" of all trades recorded as Profit; null with no trades. */
export function winRate(summary: JournalSummary): string | null {
  if (!summary.total) return null;
  return `${Number(((summary.wins / summary.total) * 100).toFixed(1))}%`;
}

/** Answered trades needed before a discipline score means anything. */
export const DISCIPLINE_MIN_ANSWERS = 5;

/**
 * The discipline score: of the trades where the member said whether they
 * followed their plan (ticked "No mistakes — followed my plan", or tagged at
 * least one mistake), the share where they did, out of 10. Null until enough
 * trades are answered: no score is better than an invented one.
 */
export function disciplineScore(summary: JournalSummary): number | null {
  const { answered, followed } = summary.discipline;
  if (answered < DISCIPLINE_MIN_ANSWERS) return null;
  return Math.round((followed / answered) * 100) / 10;
}

export function strategyWinRate(best: { trades: number; wins: number }): string {
  return `${Math.round((best.wins / best.trades) * 100)}%`;
}

export const resultLabel: Record<TradeResult, string> = { profit: 'Profit', loss: 'Loss', breakeven: 'Breakeven' };
