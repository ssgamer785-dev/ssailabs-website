import { describe, expect, it } from 'bun:test';
import {
  DISCIPLINE_MIN_ANSWERS, EMPTY_SUMMARY, disciplineScore, draftFromTrade, emptyDraft, formatMoney, formatRiskReward, fromRow, localDateString,
  parseAmount, parseRiskReward, parseSummary, rangeDates, rangeShowing, screenshotProblem, shortDate, validateDraft, winRate,
  type TradeDraft,
} from './model';

const TODAY = new Date(2026, 10, 16); // 16 Nov 2026, local
const valid = (over: Partial<TradeDraft> = {}): TradeDraft => ({
  ...emptyDraft('USD', TODAY), symbol: 'xauusd', direction: 'buy', riskReward: '1:2', result: 'profit', amount: '210', ...over,
});

describe('risk : reward', () => {
  it('reads every way a trader writes it, as the reward per 1 of risk', () => {
    expect(parseRiskReward('2')).toBe(2);
    expect(parseRiskReward('2.5')).toBe(2.5);
    expect(parseRiskReward('1:2')).toBe(2);
    expect(parseRiskReward(' 1 : 2.5 ')).toBe(2.5);
    expect(parseRiskReward('1/3')).toBe(3);
    expect(parseRiskReward('2:5')).toBe(2.5);
    expect(parseRiskReward('1:0,75')).toBe(0.75);
  });
  it('refuses what is not a positive ratio', () => {
    for (const bad of ['', 'abc', '0', '1:0', '-2', '1:-2', '2:', ':3']) expect(parseRiskReward(bad)).toBeNull();
  });
  it('is shown as 1:x', () => {
    expect(formatRiskReward(2)).toBe('1:2');
    expect(formatRiskReward(2.333)).toBe('1:2.33');
    expect(formatRiskReward(null)).toBe('—');
  });
});

describe('money', () => {
  it('shows the sign, the currency and its grouping', () => {
    expect(formatMoney(2450, 'USD')).toBe('+$2,450');
    expect(formatMoney(-120, 'USD')).toBe('-$120');
    expect(formatMoney(120000, 'INR')).toBe('+₹1,20,000');
    expect(formatMoney(0, 'EUR')).toBe('€0');
    expect(formatMoney(250.5, 'USDT')).toBe('+250.50 USDT');
  });
  it('reads an amount without a sign (the result decides it)', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(Number.isNaN(parseAmount('-50') as number)).toBe(true);
    expect(Number.isNaN(parseAmount('12.345') as number)).toBe(true);
  });
});

describe('the Add Trade form', () => {
  it('a complete trade becomes exactly what is saved', () => {
    const { problems, values } = validateDraft(valid({ strategy: '  EMA Crossover ', notes: ' Entered early. ', mistakes: ['early_entry'] }), TODAY);
    expect(problems).toEqual({});
    expect(values).toEqual({
      trade_date: '2026-11-16', symbol: 'XAUUSD', direction: 'buy', risk_reward: 2, result: 'profit', pnl_amount: 210, pnl_currency: 'USD',
      strategy: 'EMA Crossover', mistakes: ['early_entry'], followed_plan: false, notes: 'Entered early.',
    });
  });
  it('the result signs the money: a loss is negative, breakeven is zero, no amount is no money', () => {
    expect(validateDraft(valid({ result: 'loss', amount: '120' }), TODAY).values?.pnl_amount).toBe(-120);
    expect(validateDraft(valid({ result: 'breakeven', amount: '999' }), TODAY).values).toMatchObject({ pnl_amount: 0, pnl_currency: 'USD' });
    expect(validateDraft(valid({ amount: '' }), TODAY).values).toMatchObject({ pnl_amount: null, pnl_currency: null });
  });
  it('a zero profit or loss is refused (that is a breakeven)', () => {
    expect(validateDraft(valid({ amount: '0' }), TODAY).problems.amount).toContain('Breakeven');
    expect(validateDraft(valid({ result: 'loss', amount: '0' }), TODAY).problems.amount).toContain('Breakeven');
  });
  it('"followed my plan" clears mistakes; mistakes mean the plan was not followed; neither is unanswered', () => {
    expect(validateDraft(valid({ followedPlan: true, mistakes: ['fomo'] }), TODAY).values).toMatchObject({ followed_plan: true, mistakes: [] });
    expect(validateDraft(valid({ mistakes: ['fomo', 'fomo'] }), TODAY).values).toMatchObject({ followed_plan: false, mistakes: ['fomo'] });
    expect(validateDraft(valid(), TODAY).values).toMatchObject({ followed_plan: null, mistakes: [] });
  });
  it('says what is missing, next to each field', () => {
    const { problems, values } = validateDraft({ ...emptyDraft('USD', TODAY), riskReward: 'abc' }, TODAY);
    expect(values).toBeNull();
    expect(Object.keys(problems).sort()).toEqual(['direction', 'result', 'riskReward', 'symbol']);
  });
  it('refuses a future date and odd symbols, keeps a custom one', () => {
    expect(validateDraft(valid({ tradeDate: '2026-11-17' }), TODAY).problems.tradeDate).toContain('future');
    expect(validateDraft(valid({ tradeDate: '2026-02-30' }), TODAY).problems.tradeDate).toBeDefined();
    expect(validateDraft(valid({ symbol: '<script>' }), TODAY).problems.symbol).toBeDefined();
    expect(validateDraft(valid({ symbol: 'A'.repeat(25) }), TODAY).problems.symbol).toBeDefined();
    expect(validateDraft(valid({ symbol: ' nifty  50 ' }), TODAY).values?.symbol).toBe('NIFTY 50');
    expect(validateDraft(valid({ symbol: 'eur/usd' }), TODAY).values?.symbol).toBe('EUR/USD');
  });
  it('a saved trade comes back into the form as it was entered', () => {
    const trade = fromRow({ id: 't', trade_date: '2026-11-12', symbol: 'GBPUSD', direction: 'sell', risk_reward: '1.50', result: 'loss',
      pnl_amount: '-120.00', pnl_currency: 'GBP', strategy: 'Breakout', mistakes: ['fomo', 'unknown_tag'], followed_plan: false, notes: 'n',
      screenshot_key: null, screenshot_mime: null, screenshot_width: null, screenshot_height: null, created_at: 'c', updated_at: 'u' });
    expect(trade.mistakes).toEqual(['fomo']);
    expect(draftFromTrade(trade)).toMatchObject({ riskReward: '1.5', amount: '120', currency: 'GBP', result: 'loss', direction: 'sell' });
  });
});

describe('dates and filters', () => {
  it('uses the local calendar', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(shortDate('2026-11-12', TODAY)).toBe('12 Nov');
    expect(shortDate('2025-11-12', TODAY)).toBe('12 Nov 2025');
  });
  it('each range covers whole calendar days', () => {
    expect(rangeDates('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(rangeDates('last_month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeDates('three_months', TODAY)).toEqual({ from: '2026-09-01', to: '2026-11-30' });
    expect(rangeDates('year', TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(rangeDates('all', TODAY)).toEqual({ from: null, to: null });
    expect(rangeDates('last_month', new Date(2026, 0, 10))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('after saving an older trade, the list widens just enough to show it', () => {
    expect(rangeShowing('2026-11-02', 'month', TODAY)).toBe('month');
    expect(rangeShowing('2026-10-20', 'month', TODAY)).toBe('last_month');
    expect(rangeShowing('2026-03-01', 'month', TODAY)).toBe('year');
    expect(rangeShowing('2024-03-01', 'month', TODAY)).toBe('all');
  });
});

describe('the figures', () => {
  it('nothing is invented with no trades', () => {
    expect(winRate(EMPTY_SUMMARY)).toBeNull();
    expect(disciplineScore(EMPTY_SUMMARY)).toBeNull();
    expect(parseSummary(null)).toEqual(EMPTY_SUMMARY);
  });
  it('reads the database summary and derives only what follows from it', () => {
    const summary = parseSummary({ total: 9, wins: 3, losses: 4, breakevens: 2, average_rr: '1.89',
      pnl: [{ currency: 'INR', total: '1700.00', trades: 3 }, { currency: 'XXX', total: 1, trades: 1 }],
      best_strategy: { name: 'EMA Crossover', trades: 3, wins: 2 }, top_symbol: { symbol: 'XAUUSD', trades: 4 },
      top_mistake: { tag: 'fomo', times: 2 }, discipline: { answered: 5, followed: 2 } });
    expect(summary.averageRr).toBe(1.89);
    expect(summary.pnl).toEqual([{ currency: 'INR', total: 1700, trades: 3 }]);
    expect(winRate(summary)).toBe('33.3%');
    expect(disciplineScore(summary)).toBe(4);
  });
  it('no discipline score until enough trades are answered', () => {
    const few = { ...EMPTY_SUMMARY, total: 9, discipline: { answered: DISCIPLINE_MIN_ANSWERS - 1, followed: 4 } };
    expect(disciplineScore(few)).toBeNull();
    expect(disciplineScore({ ...few, discipline: { answered: 20, followed: 17 } })).toBe(8.5);
  });
});

describe('screenshots', () => {
  it('JPEG, PNG and WebP up to 10 MB', () => {
    expect(screenshotProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(screenshotProblem({ type: 'image/gif', size: 1000 })).toContain('JPEG, PNG or WebP');
    expect(screenshotProblem({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toContain('10 MB');
  });
});
