import { describe, expect, it } from 'bun:test';
import { calculatePositionSize, type CalculatorInput } from './position-size';
import { INSTRUMENTS, INSTRUMENT_GROUPS, findInstrument, type CurrencyCode } from './instruments';

/** The eight currencies of the standard Forex set, in market-convention priority. */
const CURRENCIES = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'] as const;
/** open.er-api.com USD snapshot, 28 Sep 2026 (1 USD buys this many units). */
const RATES: Record<string, number> = {
  EUR: 0.878356, GBP: 0.755594, INR: 95.927874, JPY: 157.489371, CHF: 0.829327, CAD: 1.414854, AUD: 1.425788, NZD: 1.767657,
};
const usdValue = (code: string) => (code === 'USD' ? 1 : 1 / RATES[code]);

function ok(input: CalculatorInput, rates: Record<string, number> | null = RATES) {
  const outcome = calculatePositionSize(input, rates);
  if (outcome.status !== 'ok') throw new Error(`${input.instrumentSymbol}: ${outcome.error}`);
  return outcome.result;
}

const forex = INSTRUMENTS.filter(i => i.group === 'Forex majors' || i.group === 'Forex crosses');

describe('Forex catalog', () => {
  it('lists exactly the 28 standard pairs of the eight major currencies, each once', () => {
    const expected: string[] = [];
    for (let i = 0; i < CURRENCIES.length; i++) for (let j = i + 1; j < CURRENCIES.length; j++) expected.push(CURRENCIES[i] + CURRENCIES[j]);
    expect(forex.map(i => i.symbol).sort()).toEqual(expected.sort());
    expect(new Set(INSTRUMENTS.map(i => i.symbol)).size).toBe(INSTRUMENTS.length);
  });

  it('marks the seven majors and 21 crosses', () => {
    expect(forex.filter(i => i.group === 'Forex majors').map(i => i.symbol))
      .toEqual(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD']);
    expect(forex.filter(i => i.group === 'Forex crosses')).toHaveLength(21);
  });

  it('uses the market convention for every pair: lot, pip, decimals, quote currency, label', () => {
    for (const pair of forex) {
      const quote = pair.symbol.slice(3);
      expect(pair.contractSize).toBe(100_000);
      expect(pair.quoteCurrency).toBe(quote as CurrencyCode);
      expect(pair.pipSize).toBe(quote === 'JPY' ? 0.01 : 0.0001);
      expect(pair.pricePrecision).toBe(quote === 'JPY' ? 3 : 5);
      expect(pair.label).toBe(`${pair.symbol.slice(0, 3)}/${quote}`);
      expect(pair.chartSymbol).toMatch(new RegExp(`^(FX|OANDA):${pair.symbol}$`));
    }
  });

  it('keeps every instrument that was already offered, unchanged, with XAU/USD as the default', () => {
    expect(INSTRUMENTS[0].symbol).toBe('XAUUSD');
    const before: Record<string, [number | null, string, number, string]> = {
      XAUUSD: [100, 'USD', 2, 'OANDA:XAUUSD'], XAGUSD: [5000, 'USD', 3, 'OANDA:XAGUSD'],
      EURUSD: [100000, 'USD', 5, 'FX:EURUSD'], GBPUSD: [100000, 'USD', 5, 'FX:GBPUSD'],
      AUDUSD: [100000, 'USD', 5, 'FX:AUDUSD'], NZDUSD: [100000, 'USD', 5, 'FX:NZDUSD'],
      USOIL: [1000, 'USD', 2, 'TVC:USOIL'], US30: [null, 'USD', 2, 'TVC:DJI'], NAS100: [null, 'USD', 2, 'TVC:NDX'],
      SPX500: [null, 'USD', 2, 'TVC:SPX'], BTCUSD: [null, 'USD', 2, 'BITSTAMP:BTCUSD'], ETHUSD: [null, 'USD', 2, 'BITSTAMP:ETHUSD'],
    };
    for (const [symbol, [contract, quote, precision, chart]] of Object.entries(before)) {
      const spec = findInstrument(symbol)!;
      expect([spec.contractSize, spec.quoteCurrency, spec.pricePrecision, spec.chartSymbol]).toEqual([contract, quote, precision, chart]);
    }
    // No pip is invented where brokers define it differently.
    for (const spec of INSTRUMENTS.filter(i => !forex.includes(i))) expect(spec.pipSize).toBeNull();
  });

  it('files every instrument under a dropdown heading', () => {
    for (const spec of INSTRUMENTS) expect(INSTRUMENT_GROUPS).toContain(spec.group);
  });
});

describe('every Forex pair against the pip-value formula, in every account currency', () => {
  // Independent of the calculator: lots = risk / (pips x pip value of one lot),
  // pip value of one lot = pip x 100,000 x (value of 1 quote unit in the account currency).
  for (const pair of forex) for (const deposit of ['USD', 'EUR', 'GBP', 'INR'] as const) {
    it(`${pair.label} in ${deposit}`, () => {
      const base = pair.symbol.slice(0, 3);
      const quote = pair.symbol.slice(3);
      const price = usdValue(base) / usdValue(quote); // quote units per base unit
      const open = price.toFixed(pair.pricePrecision);
      const stop = (Number(open) - 25 * pair.pipSize!).toFixed(pair.pricePrecision);
      const result = ok({ instrumentSymbol: pair.symbol, depositCurrency: deposit, openPrice: open, stopLossPrice: stop, accountBalance: '10000', risk: '1', riskUnit: 'percent' });
      const quoteInDeposit = usdValue(quote) / usdValue(deposit);
      const pipValuePerLot = pair.pipSize! * 100_000 * quoteInDeposit;
      expect(result.pips).toBe(25);
      expect(result.riskAmount).toBe(100);
      expect(result.lots! / (100 / (25 * pipValuePerLot))).toBeCloseTo(1, 9);
      expect(result.units).toBeCloseTo(result.lots! * 100_000, 6);
      // Hitting the stop loses exactly the money at risk.
      expect(result.units * result.stopDistance * result.quoteToDeposit).toBeCloseTo(100, 6);
      expect(result.direction).toBe('long');
    });
  }
});

describe('worked examples', () => {
  it('USD/JPY, USD account: 50 pips risking $100 at 150 yen is 0.30 lots', () => {
    const r = ok({ instrumentSymbol: 'USDJPY', depositCurrency: 'USD', openPrice: '150.000', stopLossPrice: '149.500', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, { JPY: 150 });
    expect(r.pips).toBe(50);
    expect(r.lots).toBeCloseTo(0.3, 10);
    expect(r.units).toBeCloseTo(30_000, 6);
  });

  it('EUR/GBP, GBP account: 20 pips risking £100 is 0.50 lots (no conversion needed)', () => {
    const r = ok({ instrumentSymbol: 'EURGBP', depositCurrency: 'GBP', openPrice: '0.85000', stopLossPrice: '0.84800', accountBalance: '5000', risk: '2', riskUnit: 'percent' }, null);
    expect(r.pips).toBe(20);
    expect(r.quoteToDeposit).toBe(1);
    expect(r.lots).toBeCloseTo(0.5, 10);
  });

  it('EUR/JPY, EUR account: 100 pips risking €1,000 with 1 JPY = 0.006 EUR is 1.6667 lots', () => {
    const r = ok({ instrumentSymbol: 'EURJPY', depositCurrency: 'EUR', openPrice: '160.000', stopLossPrice: '159.000', accountBalance: '50000', risk: '1000', riskUnit: 'currency' }, { EUR: 0.9, JPY: 150 });
    expect(r.pips).toBe(100);
    expect(r.quoteToDeposit).toBeCloseTo(0.006, 12);
    expect(r.lots).toBeCloseTo(1000 / 600, 10);
  });

  it('USD/CHF short: a stop above entry sizes the same as a long', () => {
    const long = ok({ instrumentSymbol: 'USDCHF', depositCurrency: 'USD', openPrice: '0.83000', stopLossPrice: '0.82700', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, RATES);
    const short = ok({ instrumentSymbol: 'USDCHF', depositCurrency: 'USD', openPrice: '0.83000', stopLossPrice: '0.83300', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, RATES);
    expect(short.direction).toBe('short');
    expect(short.pips).toBe(30);
    expect(short.lots!).toBeCloseTo(long.lots!, 12);
  });

  it('counts pips without float noise (1.08500 - 1.08000 is 50 pips)', () => {
    expect(ok({ instrumentSymbol: 'EURUSD', depositCurrency: 'USD', openPrice: '1.08500', stopLossPrice: '1.08000', accountBalance: '10000', risk: '1', riskUnit: 'percent' }).pips).toBe(50);
  });

  it('refuses a JPY pair in a USD account when no JPY rate is available, rather than guessing', () => {
    const outcome = calculatePositionSize({ instrumentSymbol: 'USDJPY', depositCurrency: 'USD', openPrice: '150.000', stopLossPrice: '149.500', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, { EUR: 0.9 });
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') expect(outcome.error).toContain('JPY/USD');
  });
});
