import { describe, expect, it } from 'bun:test';
import {
  calculateMtLots,
  calculatePositionSize,
  floorToStep,
  stepDecimals,
  type BrokerSpecInput,
  type CalculatorInput,
  type CalculatorResult,
} from './position-size';
import { INSTRUMENTS, defaultMtContractSize, findInstrument, isForex, unitName } from './instruments';

/** open.er-api.com USD snapshot, 28 Sep 2026 (1 USD buys this many units). */
const RATES: Record<string, number> = {
  EUR: 0.878356, GBP: 0.755594, INR: 95.927874, JPY: 157.489371, CHF: 0.829327, CAD: 1.414854, AUD: 1.425788, NZD: 1.767657,
  SGD: 1.278218, HKD: 7.844488, ZAR: 16.322134, MXN: 17.735545, TRY: 48.948487, SEK: 9.923533, NOK: 9.514776, PLN: 3.840834,
  CNH: 6.721742,
};

function position(input: CalculatorInput, rates: Record<string, number> | null = RATES): CalculatorResult {
  const outcome = calculatePositionSize(input, rates);
  if (outcome.status !== 'ok') throw new Error(`${input.instrumentSymbol}: ${outcome.error}`);
  return outcome.result;
}

function mt(result: CalculatorResult, spec: Partial<BrokerSpecInput>) {
  const outcome = calculateMtLots(result, { contractSize: '', minLot: '', maxLot: '', lotStep: '', ...spec });
  if (outcome.status !== 'ok') throw new Error(outcome.error);
  return outcome.mt;
}

function mtError(result: CalculatorResult, spec: Partial<BrokerSpecInput>) {
  const outcome = calculateMtLots(result, { contractSize: '', minLot: '', maxLot: '', lotStep: '', ...spec });
  if (outcome.status !== 'error') throw new Error('expected a validation error');
  return outcome.error;
}

/** The client's screenshot: SOL/USD, USD account, open 12000, stop 1100, balance 100000, risk 5%. */
const SOL_CASE: CalculatorInput = {
  instrumentSymbol: 'SOLUSD', depositCurrency: 'USD', openPrice: '12000', stopLossPrice: '1100',
  accountBalance: '100000', risk: '5', riskUnit: 'percent',
};

describe('the SOL/USD screenshot case', () => {
  const result = position(SOL_CASE, null);

  it('normal mode: USD 5,000 target over a 10,900 stop is 0.458715596 SOL, with no lot size invented', () => {
    expect(result.riskAmount).toBe(5000);
    expect(result.stopDistance).toBe(10900);
    expect(result.units).toBeCloseTo(5000 / 10900, 12);
    expect(result.units).toBeCloseTo(0.458715596, 9);
    expect(result.lots).toBeNull();
    expect(result.direction).toBe('long');
  });

  it('MT4/MT5: 1 SOL per lot, minimum 0.01, step 0.01 gives 0.45 lots risking USD 4,905 against a USD 5,000 target', () => {
    const r = mt(result, { contractSize: '1', minLot: '0.01', lotStep: '0.01' });
    expect(r.theoreticalLots).toBeCloseTo(0.458715596, 9);
    expect(r.executableLots).toBe(0.45);
    expect(r.executableUnits).toBeCloseTo(0.45, 12);
    expect(r.targetRisk).toBe(5000);
    expect(r.actualRisk).toBeCloseTo(4905, 9);
    expect(r.actualRisk).not.toBe(r.targetRisk);
    expect(r.limit).toBe('none');
  });

  it('a sell with the same stop distance (stop at 22,900) sizes the same', () => {
    const short = position({ ...SOL_CASE, stopLossPrice: '22900' }, null);
    expect(short.direction).toBe('short');
    const r = mt(short, { contractSize: '1', minLot: '0.01', lotStep: '0.01' });
    expect(r.executableLots).toBe(0.45);
    expect(r.actualRisk).toBeCloseTo(4905, 9);
  });

  it('other SOL contract sizes', () => {
    const ten = mt(result, { contractSize: '10', minLot: '0.01', lotStep: '0.01' });
    expect(ten.theoreticalLots).toBeCloseTo(0.0458715596, 10);
    expect(ten.executableLots).toBe(0.04);
    expect(ten.executableUnits).toBeCloseTo(0.4, 12);
    expect(ten.actualRisk).toBeCloseTo(4360, 9);

    const tenth = mt(result, { contractSize: '0.1', minLot: '0.01', lotStep: '0.01' });
    expect(tenth.theoreticalLots).toBeCloseTo(4.58715596, 8);
    expect(tenth.executableLots).toBe(4.58);
    expect(tenth.executableUnits).toBeCloseTo(0.458, 12);
    expect(tenth.actualRisk).toBeCloseTo(4992.2, 8);

    // 100 SOL per lot: the smallest order (0.01 lot = 1 SOL) would lose USD 10,900, more than the target.
    const hundred = mt(result, { contractSize: '100', minLot: '0.01', lotStep: '0.01' });
    expect(hundred.limit).toBe('below-minimum');
    expect(hundred.executableLots).toBeNull();
    expect(hundred.actualRisk).toBeNull();
    expect(hundred.smallestLots).toBe(0.01);
    expect(hundred.smallestRisk).toBeCloseTo(10900, 9);
  });

  it('without a lot step the size is exact, not executable, and risks exactly the target', () => {
    const r = mt(result, { contractSize: '1' });
    expect(r.limit).toBe('not-rounded');
    expect(r.executableLots).toBeCloseTo(0.458715596, 9);
    expect(r.actualRisk).toBeCloseTo(5000, 9);
  });
});

describe('contract size', () => {
  const result = position(SOL_CASE, null);

  it('is required, and never guessed, for an instrument without a standard one', () => {
    expect(mtError(result, {})).toContain("contract size for SOL/USD");
    expect(mtError(result, { contractSize: '   ' })).toContain('contract size for SOL/USD');
  });

  it('must be a positive number', () => {
    // '100 000' is how MT5's Specification prints it; a space or comma is refused, never read as 100 or 100000.
    for (const bad of ['0', '-1', 'abc', '1,5', '100,000', '100 000', 'Infinity', '1e400']) {
      expect(mtError(result, { contractSize: bad })).toBe('Contract size must be a number greater than zero, without spaces or commas.');
    }
  });

  it('starts at 100,000 for every spot Forex pair and empty for everything else', () => {
    for (const spec of INSTRUMENTS) {
      expect(defaultMtContractSize(spec)).toBe(isForex(spec) ? '100000' : '');
    }
    expect(INSTRUMENTS.filter(isForex)).toHaveLength(40);
    expect(INSTRUMENTS.filter(i => !isForex(i)).map(i => i.symbol))
      .toEqual(['XAUUSD', 'XAGUSD', 'USOIL', 'US30', 'NAS100', 'SPX500', 'BTCUSD', 'ETHUSD', 'SOLUSD']);
  });

  it('names what one unit is', () => {
    expect(['SOLUSD', 'BTCUSD', 'EURUSD', 'USDJPY', 'XAUUSD', 'USOIL', 'US30'].map(s => unitName(findInstrument(s)!)))
      .toEqual(['SOL', 'BTC', 'EUR', 'USD', 'oz', 'barrels', 'units']);
  });
});

describe('broker limits', () => {
  const result = position(SOL_CASE, null);

  it('reject zero, negative and non-numeric values, and a maximum below the minimum', () => {
    expect(mtError(result, { contractSize: '1', minLot: '0' })).toBe('Minimum lot must be a number greater than zero, or left empty.');
    expect(mtError(result, { contractSize: '1', maxLot: 'abc' })).toBe('Maximum lot must be a number greater than zero, or left empty.');
    expect(mtError(result, { contractSize: '1', lotStep: '-0.01' })).toBe('Lot step must be a number greater than zero, or left empty.');
    expect(mtError(result, { contractSize: '1', minLot: '1', maxLot: '0.5' })).toBe('Maximum lot cannot be smaller than the minimum lot.');
  });

  it('reject limits that allow no volume at all, rather than calling the target too small', () => {
    const none = 'These lot limits allow no volume at all: check the minimum lot, lot step and maximum lot.';
    expect(mtError(result, { contractSize: '1', minLot: '0.5', maxLot: '0.5', lotStep: '0.2' })).toBe(none); // grid 0.4, 0.6
    expect(mtError(result, { contractSize: '1', maxLot: '0.005', lotStep: '0.01' })).toBe(none); // one step is above the maximum
    // On the grid, a minimum equal to the maximum is one allowed volume.
    const single = mt(result, { contractSize: '1', minLot: '0.3', maxLot: '0.3', lotStep: '0.1' });
    expect(single.executableLots).toBe(0.3);
    expect(single.limit).toBe('capped');
  });

  it('only report "no permissible size" when the smallest order really risks more than the target', () => {
    const specs: Partial<BrokerSpecInput>[] = [
      { minLot: '0.01', lotStep: '0.01' }, { minLot: '0.05', lotStep: '0.02' }, { lotStep: '0.1' }, { minLot: '0.3' },
      { minLot: '0.1', maxLot: '0.2', lotStep: '0.1' }, { minLot: '1', maxLot: '100', lotStep: '1' },
    ];
    for (const riskPercent of ['0.001', '0.01', '0.05', '0.1', '0.3', '0.5', '1', '5', '20']) {
      const target = position({ ...SOL_CASE, risk: riskPercent }, null);
      for (const spec of specs) {
        const r = mt(target, { contractSize: '1', ...spec });
        if (r.limit === 'below-minimum') {
          expect(r.executableLots).toBeNull();
          expect(r.smallestRisk!).toBeGreaterThan(r.targetRisk);
        } else {
          expect(r.actualRisk!).toBeLessThanOrEqual(r.targetRisk * (1 + 1e-12));
        }
      }
    }
  });

  it('round down to steps of 0.1, 1 and 0.001', () => {
    expect(mt(result, { contractSize: '1', lotStep: '0.1' }).executableLots).toBe(0.4);
    expect(mt(result, { contractSize: '0.1', lotStep: '1' }).executableLots).toBe(4);
    expect(mt(result, { contractSize: '1', lotStep: '0.001' }).executableLots).toBe(0.458);
  });

  it('cap at the maximum lot, on the step grid, and report it', () => {
    const eurusd = position({ instrumentSymbol: 'EURUSD', depositCurrency: 'USD', openPrice: '1.08500', stopLossPrice: '1.08000', accountBalance: '100000', risk: '10', riskUnit: 'percent' });
    const r = mt(eurusd, { contractSize: '100000', minLot: '0.01', maxLot: '5.005', lotStep: '0.01' });
    expect(r.theoreticalLots).toBeCloseTo(20, 9);
    expect(r.executableLots).toBe(5);
    expect(r.limit).toBe('capped');
    expect(r.actualRisk).toBeCloseTo(2500, 6);
  });

  it('use one step as the smallest order when no minimum is given', () => {
    const tiny = position({ ...SOL_CASE, risk: '0.01' }, null); // USD 10 over 10,900 = 0.000917 SOL
    const r = mt(tiny, { contractSize: '1', lotStep: '0.01' });
    expect(r.limit).toBe('below-minimum');
    expect(r.smallestLots).toBe(0.01);
    expect(r.smallestRisk).toBeCloseTo(109, 9);
  });

  it('put a minimum that is off the step grid onto it', () => {
    const tiny = position({ ...SOL_CASE, risk: '0.3' }, null); // USD 300 / 10,900 = 0.0275 lots
    const r = mt(tiny, { contractSize: '1', minLot: '0.05', lotStep: '0.02' });
    expect(r.limit).toBe('below-minimum');
    expect(r.smallestLots).toBe(0.06);
  });

  it('keep an exact size above the minimum when no step is given', () => {
    const r = mt(result, { contractSize: '1', minLot: '0.01' });
    expect(r.limit).toBe('not-rounded');
    expect(r.executableLots).toBeCloseTo(0.458715596, 9);
  });

  it('accept a size exactly on the minimum', () => {
    const exact = position({ ...SOL_CASE, riskUnit: 'currency', risk: '109' }, null); // 109 / 10,900 = 0.01
    const r = mt(exact, { contractSize: '1', minLot: '0.01', lotStep: '0.01' });
    expect(r.executableLots).toBe(0.01);
    expect(r.actualRisk).toBeCloseTo(109, 9);
  });
});

describe('rounding down', () => {
  it('keeps exact multiples despite floating point (0.46, 0.29, 0.57, 0.2)', () => {
    expect(floorToStep(0.46, 0.01)).toBe(0.46);
    expect(floorToStep(0.29, 0.01)).toBe(0.29);
    expect(floorToStep(0.57, 0.01)).toBe(0.57);
    expect(floorToStep(0.1 + 0.2 - 0.1, 0.01)).toBe(0.2);
  });

  it('never rounds up and never loses a whole step, over 5,000 sizes and five steps', () => {
    let seed = 42;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const step of [0.001, 0.01, 0.02, 0.1, 1]) {
      for (let i = 0; i < 1000; i++) {
        const value = random() * 50;
        const floored = floorToStep(value, step);
        expect(floored).toBeLessThanOrEqual(value * (1 + 1e-9) + 1e-12);
        expect(value - floored).toBeLessThan(step + 1e-9);
      }
    }
  });

  it('prints steps with their own decimals', () => {
    expect([0.01, 1, 0.5, 0.001, 1e-7, 0.00001, 10].map(stepDecimals)).toEqual([2, 0, 1, 3, 7, 5, 0]);
  });
});

describe('Forex in MT4/MT5 mode', () => {
  it('EUR/USD: 50 pips risking USD 100 is exactly 0.20 lots, not 0.19', () => {
    const r = mt(position({ instrumentSymbol: 'EURUSD', depositCurrency: 'USD', openPrice: '1.08500', stopLossPrice: '1.08000', accountBalance: '10000', risk: '1', riskUnit: 'percent' }),
      { contractSize: defaultMtContractSize(findInstrument('EURUSD')!), minLot: '0.01', lotStep: '0.01' });
    expect(r.theoreticalLots).toBeCloseTo(0.2, 12);
    expect(r.executableLots).toBe(0.2);
    expect(r.actualRisk).toBeCloseTo(100, 9);
  });

  it('USD/JPY in a USD account converts the yen loss before sizing', () => {
    const at150 = mt(position({ instrumentSymbol: 'USDJPY', depositCurrency: 'USD', openPrice: '150.000', stopLossPrice: '149.500', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, { JPY: 150 }),
      { contractSize: '100000', minLot: '0.01', lotStep: '0.01' });
    expect(at150.executableLots).toBe(0.3);
    expect(at150.lossPerLot).toBeCloseTo(50000 / 150, 9);
    const live = mt(position({ instrumentSymbol: 'USDJPY', depositCurrency: 'USD', openPrice: '157.489', stopLossPrice: '156.989', accountBalance: '10000', risk: '1', riskUnit: 'percent' }),
      { contractSize: '100000', minLot: '0.01', lotStep: '0.01' });
    expect(live.theoreticalLots).toBeCloseTo(0.31497874, 7);
    expect(live.executableLots).toBe(0.31);
    expect(live.actualRisk!).toBeCloseTo(0.31 * 100000 * 0.5 / 157.489371, 9);
    expect(live.actualRisk!).toBeLessThan(100);
  });

  it('a broker contract size that differs from 100,000 is honoured', () => {
    const mini = mt(position({ instrumentSymbol: 'EURUSD', depositCurrency: 'USD', openPrice: '1.08500', stopLossPrice: '1.08000', accountBalance: '10000', risk: '1', riskUnit: 'percent' }),
      { contractSize: '10000', minLot: '0.01', lotStep: '0.01' });
    expect(mini.executableLots).toBe(2);
  });

  it('crosses in other account currencies: EUR/GBP in USD, GBP/JPY in INR, AUD/CAD in EUR', () => {
    const cases: [string, 'USD' | 'EUR' | 'GBP' | 'INR', string, string][] = [
      ['EURGBP', 'USD', '0.86023', '0.85823'], ['GBPJPY', 'INR', '208.430', '207.930'], ['AUDCAD', 'EUR', '0.99233', '0.99533'],
    ];
    for (const [symbol, deposit, open, stop] of cases) {
      const base = position({ instrumentSymbol: symbol, depositCurrency: deposit, openPrice: open, stopLossPrice: stop, accountBalance: '100000', risk: '1', riskUnit: 'percent' });
      const r = mt(base, { contractSize: '100000', minLot: '0.01', lotStep: '0.01' });
      expect(r.theoreticalLots).toBeCloseTo(base.units / 100000, 12);
      expect(r.executableLots).toBe(Math.floor(r.theoreticalLots * 100 + 1e-9) / 100);
      expect(r.actualRisk!).toBeLessThanOrEqual(r.targetRisk * (1 + 1e-9));
      expect(r.targetRisk - r.actualRisk!).toBeLessThan(0.01 * r.lossPerLot + 1e-9);
    }
  });

  it('each of the 12 exotic pairs, in a USD account', () => {
    for (const pair of INSTRUMENTS.filter(i => i.group === 'Forex exotics')) {
      const base = pair.symbol.slice(0, 3); const quote = pair.symbol.slice(3);
      const usd = (c: string) => (c === 'USD' ? 1 : 1 / RATES[c]);
      const open = (usd(base) / usd(quote)).toFixed(5);
      const stop = (Number(open) - 0.0250).toFixed(5); // 250 pips
      const sized = position({ instrumentSymbol: pair.symbol, depositCurrency: 'USD', openPrice: open, stopLossPrice: stop, accountBalance: '100000', risk: '1', riskUnit: 'percent' });
      const r = mt(sized, { contractSize: defaultMtContractSize(pair), minLot: '0.01', lotStep: '0.01' });
      expect(r.contractSize).toBe(100000);
      // Independent: one lot loses 250 pips x 10 quote units per pip, converted to USD.
      expect(r.lossPerLot).toBeCloseTo(250 * 10 * usd(quote), 6);
      expect(r.theoreticalLots).toBeCloseTo(1000 / r.lossPerLot, 9);
      expect(r.executableLots).toBe(Math.floor(r.theoreticalLots * 100 + 1e-9) / 100);
      expect(r.actualRisk!).toBeLessThanOrEqual(1000 * (1 + 1e-9));
    }
  });
});

describe('XAU/USD in MT4/MT5 mode', () => {
  const gold = position({ instrumentSymbol: 'XAUUSD', depositCurrency: 'USD', openPrice: '4163.91000', stopLossPrice: '4080.63180', accountBalance: '100000', risk: '2', riskUnit: 'percent' });

  it('asks for the broker contract size rather than assuming one', () => {
    expect(defaultMtContractSize(gold.instrument)).toBe('');
    expect(mtError(gold, {})).toContain('contract size for XAU/USD');
  });

  it('100 oz per lot, step 0.01: 0.24 lots risking USD 1,998.68 against USD 2,000', () => {
    const r = mt(gold, { contractSize: '100', minLot: '0.01', lotStep: '0.01' });
    expect(r.theoreticalLots).toBeCloseTo(0.2401590, 6);
    expect(r.executableLots).toBe(0.24);
    expect(r.actualRisk).toBeCloseTo(0.24 * 100 * 83.2782, 6);
    expect(r.targetRisk).toBe(2000);
  });

  it('normal mode is unchanged (0.24016 lots at the conventional 100 oz)', () => {
    expect(gold.lots).toBeCloseTo(0.2401590, 6);
    expect(gold.units).toBeCloseTo(24.01590, 4);
  });
});

describe('every one of the 49 instruments', () => {
  it('rounds down within the limits and never above the target, in USD and EUR accounts', () => {
    expect(INSTRUMENTS).toHaveLength(49);
    for (const spec of INSTRUMENTS) for (const deposit of ['USD', 'EUR'] as const) {
      const sized = position({ instrumentSymbol: spec.symbol, depositCurrency: deposit, openPrice: '100', stopLossPrice: '99', accountBalance: '1000000', risk: '1', riskUnit: 'percent' });
      const contractSize = defaultMtContractSize(spec) || '1';
      const r = mt(sized, { contractSize, minLot: '0.01', maxLot: '100', lotStep: '0.01' });
      expect(r.theoreticalLots).toBeCloseTo(sized.units / Number(contractSize), 9);
      if (r.executableLots === null) {
        expect(r.limit).toBe('below-minimum');
        expect(r.theoreticalLots).toBeLessThan(0.01);
      } else {
        expect(r.executableLots).toBeLessThanOrEqual(r.theoreticalLots * (1 + 1e-9));
        expect(r.executableLots).toBeGreaterThanOrEqual(0.01);
        expect(r.executableLots).toBeLessThanOrEqual(100);
        expect(Math.abs(r.executableLots * 100 - Math.round(r.executableLots * 100))).toBeLessThan(1e-9);
        expect(r.actualRisk!).toBeLessThanOrEqual(r.targetRisk * (1 + 1e-9));
        if (r.limit === 'none') expect(r.targetRisk - r.actualRisk!).toBeLessThan(0.01 * r.lossPerLot + 1e-6);
      }
    }
  });
});

describe('inputs that never reach MT4/MT5 sizing', () => {
  it('a stop equal to the open, a zero price and a missing conversion rate are refused first', () => {
    expect(calculatePositionSize({ ...SOL_CASE, stopLossPrice: '12000' }, null).status).toBe('error');
    expect(calculatePositionSize({ ...SOL_CASE, openPrice: '0' }, null).status).toBe('error');
    const noRate = calculatePositionSize({ instrumentSymbol: 'USDJPY', depositCurrency: 'USD', openPrice: '150.000', stopLossPrice: '149.500', accountBalance: '10000', risk: '1', riskUnit: 'percent' }, { EUR: 0.9 });
    expect(noRate.status).toBe('error');
    if (noRate.status === 'error') expect(noRate.error).toContain('JPY/USD');
  });
});
