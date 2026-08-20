import { describe, expect, it } from 'bun:test';
import { calculatePositionSize, formatSize, type CalculatorInput } from './position-size';
import { INSTRUMENTS, findInstrument } from './instruments';

/** The reference screenshot's inputs; individual tests override what they vary. */
const BASE: CalculatorInput = {
  instrumentSymbol: 'XAUUSD',
  depositCurrency: 'USD',
  openPrice: '4163.91000',
  stopLossPrice: '4080.63180',
  accountBalance: '100000',
  risk: '2',
  riskUnit: 'percent',
};

function run(overrides: Partial<CalculatorInput> = {}) {
  return calculatePositionSize({ ...BASE, ...overrides });
}

function expectOk(outcome: ReturnType<typeof run>) {
  if (outcome.status !== 'ok') throw new Error(`expected success, got: ${outcome.error}`);
  return outcome.result;
}

function expectError(outcome: ReturnType<typeof run>) {
  if (outcome.status !== 'error') throw new Error('expected a validation error, got a result');
  return outcome.error;
}

describe('1. XAU/USD reference case', () => {
  it('reproduces the cashbackforex screenshot exactly', () => {
    const r = expectOk(run());
    // Screenshot shows Units = 24.016
    expect(r.units.toFixed(3)).toBe('24.016');
    expect(r.riskAmount).toBe(2000);
    expect(r.stopDistance).toBeCloseTo(83.2782, 4);
    // 24.0158... oz / 100 oz per lot
    expect(r.lots).toBeCloseTo(0.240159, 6);
    expect(r.direction).toBe('long');
  });
});

describe('2. different account balances', () => {
  it('scales the position linearly with balance', () => {
    const small = expectOk(run({ accountBalance: '10000' }));
    const large = expectOk(run({ accountBalance: '1000000' }));
    expect(small.units).toBeCloseTo(2.4015888, 6);
    expect(large.units).toBeCloseTo(240.15888, 4);
    // 100x the balance is 100x the size at the same risk %
    expect(large.units / small.units).toBeCloseTo(100, 9);
  });

  it('handles a fractional balance', () => {
    const r = expectOk(run({ accountBalance: '2537.42' }));
    expect(r.riskAmount).toBeCloseTo(50.7484, 6);
    expect(r.units).toBeCloseTo(50.7484 / 83.2782, 8);
  });
});

describe('3. different risk percentages', () => {
  it('scales linearly with risk', () => {
    const one = expectOk(run({ risk: '1' }));
    const five = expectOk(run({ risk: '5' }));
    expect(one.riskAmount).toBe(1000);
    expect(five.riskAmount).toBe(5000);
    expect(five.units / one.units).toBeCloseTo(5, 9);
  });

  it('accepts a risk given as a currency amount instead of a percent', () => {
    const r = expectOk(run({ risk: '2000', riskUnit: 'currency' }));
    expect(r.riskAmount).toBe(2000);
    // Same money at risk as 2% of 100k, so the same size
    expect(r.units.toFixed(3)).toBe('24.016');
  });

  it('accepts exactly 100% but rejects more', () => {
    expect(expectOk(run({ risk: '100' })).riskAmount).toBe(100000);
    expect(expectError(run({ risk: '100.01' }))).toContain('more than 100%');
  });

  it('rejects a currency risk larger than the balance', () => {
    expect(expectError(run({ risk: '100001', riskUnit: 'currency' })))
      .toContain('more than the account balance');
  });
});

describe('3b. Risk unit: % vs $', () => {
  it('% mode takes Risk as a share of the balance', () => {
    // Brief: balance 100000, risk 2% -> risk amount 2000
    const r = expectOk(run({ accountBalance: '100000', risk: '2', riskUnit: 'percent' }));
    expect(r.riskAmount).toBe(2000);
  });

  it('$ mode takes Risk as the money at stake, ignoring the balance', () => {
    // Brief: balance 100000, risk $500 -> risk amount 500
    const r = expectOk(run({ accountBalance: '100000', risk: '500', riskUnit: 'currency' }));
    expect(r.riskAmount).toBe(500);
  });

  it('$ mode is unaffected by the balance', () => {
    const small = expectOk(run({ accountBalance: '1000', risk: '500', riskUnit: 'currency' }));
    const large = expectOk(run({ accountBalance: '5000000', risk: '500', riskUnit: 'currency' }));
    expect(small.riskAmount).toBe(500);
    expect(large.riskAmount).toBe(500);
    expect(small.units).toBeCloseTo(large.units, 9);
  });

  it('the two modes agree when they describe the same money', () => {
    const pct = expectOk(run({ accountBalance: '100000', risk: '0.5', riskUnit: 'percent' }));
    const dollars = expectOk(run({ accountBalance: '100000', risk: '500', riskUnit: 'currency' }));
    expect(pct.riskAmount).toBe(500);
    expect(dollars.riskAmount).toBe(500);
    expect(pct.units).toBeCloseTo(dollars.units, 9);
    expect(pct.lots).toBeCloseTo(dollars.lots, 9);
  });

  it('sizes the $500 example correctly end to end', () => {
    // 500 / 83.2782 = 6.0040 oz -> 0.060040 lots at 100 oz per lot
    const r = expectOk(run({ accountBalance: '100000', risk: '500', riskUnit: 'currency' }));
    expect(r.units).toBeCloseTo(500 / 83.2782, 8);
    expect(r.units.toFixed(3)).toBe('6.004');
    expect(r.lots).toBeCloseTo(0.0600397, 6);
  });

  it('applies the 100 ceiling only to %, not to $', () => {
    // 500 would be nonsense as a percent but is a normal dollar risk.
    expect(expectError(run({ risk: '500', riskUnit: 'percent' }))).toContain('more than 100%');
    expect(expectOk(run({ risk: '500', riskUnit: 'currency' })).riskAmount).toBe(500);
  });

  it('rejects zero, negative and blank in $ mode too', () => {
    expect(expectError(run({ risk: '0', riskUnit: 'currency' })))
      .toBe('Risk must be greater than zero.');
    expect(expectError(run({ risk: '-500', riskUnit: 'currency' })))
      .toContain('greater than zero');
    expect(expectError(run({ risk: '', riskUnit: 'currency' })))
      .toContain('valid risk value');
    expect(expectError(run({ risk: 'abc', riskUnit: 'currency' })))
      .toContain('valid risk value');
  });

  it('rejects a $ risk above the balance, and accepts one equal to it', () => {
    expect(expectError(run({ accountBalance: '1000', risk: '1000.01', riskUnit: 'currency' })))
      .toContain('more than the account balance');
    expect(expectOk(run({ accountBalance: '1000', risk: '1000', riskUnit: 'currency' })).riskAmount)
      .toBe(1000);
  });

  it('handles a fractional $ risk', () => {
    const r = expectOk(run({ risk: '12.75', riskUnit: 'currency' }));
    expect(r.riskAmount).toBe(12.75);
    expect(r.units).toBeCloseTo(12.75 / 83.2782, 9);
  });

  it('works for a short trade in $ mode', () => {
    const r = expectOk(run({
      openPrice: '4080.6318', stopLossPrice: '4163.91',
      risk: '500', riskUnit: 'currency',
    }));
    expect(r.direction).toBe('short');
    expect(r.riskAmount).toBe(500);
    expect(r.units.toFixed(3)).toBe('6.004');
  });

  it('respects contract size in $ mode when the instrument changes', () => {
    const gold = expectOk(run({ risk: '500', riskUnit: 'currency', instrumentSymbol: 'XAUUSD' }));
    const eur = expectOk(run({ risk: '500', riskUnit: 'currency', instrumentSymbol: 'EURUSD' }));
    expect(gold.units).toBeCloseTo(eur.units, 9);
    expect(gold.lots).toBeCloseTo(gold.units / 100, 9);
    expect(eur.lots).toBeCloseTo(eur.units / 100000, 9);
  });
});

describe('4. different stop-loss distances', () => {
  it('sizes inversely to the stop distance', () => {
    const tight = expectOk(run({ stopLossPrice: '4153.91' }));   // 10.00 away
    const wide = expectOk(run({ stopLossPrice: '4063.91' }));    // 100.00 away
    expect(tight.stopDistance).toBeCloseTo(10, 9);
    expect(wide.stopDistance).toBeCloseTo(100, 9);
    expect(tight.units).toBeCloseTo(200, 9);
    expect(wide.units).toBeCloseTo(20, 9);
    // 10x the stop distance is 1/10th the size
    expect(tight.units / wide.units).toBeCloseTo(10, 9);
  });

  it('rejects a stop equal to the open price', () => {
    expect(expectError(run({ stopLossPrice: BASE.openPrice })))
      .toContain('different from the open price');
  });
});

describe('5 & 6. long and short trades', () => {
  it('treats a stop below entry as long', () => {
    const r = expectOk(run({ openPrice: '4163.91', stopLossPrice: '4080.6318' }));
    expect(r.direction).toBe('long');
  });

  it('treats a stop above entry as short', () => {
    const r = expectOk(run({ openPrice: '4080.6318', stopLossPrice: '4163.91' }));
    expect(r.direction).toBe('short');
  });

  it('sizes a long and a short with the same gap identically', () => {
    const long = expectOk(run({ openPrice: '4163.91', stopLossPrice: '4080.6318' }));
    const short = expectOk(run({ openPrice: '4080.6318', stopLossPrice: '4163.91' }));
    expect(short.units).toBeCloseTo(long.units, 9);
    expect(short.lots).toBeCloseTo(long.lots, 9);
  });
});

describe('7. empty inputs', () => {
  it.each([
    ['openPrice', 'valid open price'],
    ['stopLossPrice', 'valid stop loss price'],
    ['accountBalance', 'valid account balance'],
    ['risk', 'valid risk value'],
  ] as const)('rejects an empty %s', (field, message) => {
    expect(expectError(run({ [field]: '' }))).toContain(message);
  });

  it('rejects whitespace-only input', () => {
    expect(expectError(run({ accountBalance: '   ' }))).toContain('valid account balance');
  });

  it('rejects non-numeric text', () => {
    expect(expectError(run({ openPrice: 'abc' }))).toContain('valid open price');
    expect(expectError(run({ risk: '12abc' }))).toContain('valid risk value');
  });
});

describe('8. zero and negative inputs', () => {
  it.each([
    ['openPrice', 'Open price must be greater than zero.'],
    ['stopLossPrice', 'Stop loss price must be greater than zero.'],
    ['accountBalance', 'Account balance must be greater than zero.'],
    ['risk', 'Risk must be greater than zero.'],
  ] as const)('rejects a zero %s', (field, message) => {
    expect(expectError(run({ [field]: '0' }))).toBe(message);
  });

  it.each(['openPrice', 'stopLossPrice', 'accountBalance', 'risk'] as const)(
    'rejects a negative %s', field => {
      expect(expectError(run({ [field]: '-5' }))).toContain('greater than zero');
    });
});

describe('9. very small and very large values', () => {
  it('handles a tiny stop distance without overflowing', () => {
    const r = expectOk(run({ openPrice: '4163.91000', stopLossPrice: '4163.90999' }));
    expect(Number.isFinite(r.units)).toBe(true);
    expect(r.units).toBeGreaterThan(0);
  });

  it('handles a very small balance', () => {
    const r = expectOk(run({ accountBalance: '1', risk: '1' }));
    expect(r.riskAmount).toBeCloseTo(0.01, 10);
    expect(r.units).toBeGreaterThan(0);
    expect(Number.isFinite(r.lots)).toBe(true);
  });

  it('handles a very large balance', () => {
    const r = expectOk(run({ accountBalance: '1000000000' }));
    expect(Number.isFinite(r.units)).toBe(true);
    expect(r.units).toBeCloseTo(240158.88912, 4);
  });

  it('rejects values that are not finite', () => {
    expect(expectError(run({ accountBalance: 'Infinity' }))).toContain('valid account balance');
    expect(expectError(run({ openPrice: 'NaN' }))).toContain('valid open price');
  });
});

describe('10. instrument switching', () => {
  it('applies each instrument\'s own contract size', () => {
    // Same money at risk and same stop gap: units are identical, lots differ
    // purely by contract size.
    const gold = expectOk(run({ instrumentSymbol: 'XAUUSD' }));
    const eur = expectOk(run({ instrumentSymbol: 'EURUSD' }));
    const btc = expectOk(run({ instrumentSymbol: 'BTCUSD' }));

    expect(gold.units).toBeCloseTo(eur.units, 9);
    expect(gold.lots).toBeCloseTo(gold.units / 100, 9);
    expect(eur.lots).toBeCloseTo(eur.units / 100000, 9);
    expect(btc.lots).toBeCloseTo(btc.units, 9);
  });

  it('exposes a spec for every instrument in the dropdown', () => {
    for (const spec of INSTRUMENTS) {
      expect(findInstrument(spec.symbol)).toBeDefined();
      expect(spec.contractSize).toBeGreaterThan(0);
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown instrument', () => {
    expect(expectError(run({ instrumentSymbol: 'NOPE' }))).toContain('Choose an instrument');
  });
});

describe('deposit currency guard', () => {
  it('calculates when the account currency matches the quote currency', () => {
    expect(expectOk(run({ depositCurrency: 'USD' })).units).toBeGreaterThan(0);
  });

  it('refuses rather than guessing an FX rate', () => {
    const message = expectError(run({ depositCurrency: 'INR' }));
    expect(message).toContain('USD/INR');
    expect(message).toContain("isn't configured");
  });
});

describe('formatSize', () => {
  it('trims trailing zeros', () => {
    expect(formatSize(0.24, 2)).toBe('0.24');
    expect(formatSize(24.015888, 3)).toBe('24.016');
  });

  it('groups thousands', () => {
    expect(formatSize(240158.889, 3)).toBe('240,158.889');
  });

  it('widens precision instead of rounding a micro position to zero', () => {
    // 0.00024 lots at 2dp would read "0" — misleading for a real position.
    expect(formatSize(0.00024016, 2)).toBe('0.0002');
    expect(formatSize(0.0000001, 2)).toBe('0.0000001');
    expect(formatSize(0, 2)).toBe('0');
  });
});
