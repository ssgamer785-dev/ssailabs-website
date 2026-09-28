/**
 * Position sizing for the Risk Calculator.
 *
 * Pure and side-effect free so the arithmetic can be tested directly.
 *
 * The model, in one line:
 *
 *   units = riskAmount / (stopDistance × quoteToDepositRate)
 *   lots  = units / contractSize
 *
 * where `stopDistance` is the absolute price gap between entry and stop, and
 * `riskAmount` is what the account is prepared to lose on the trade. Direction
 * falls out of the sign of (open − stop) and does not change the size — a long
 * and a short with the same gap risk the same money.
 */

import { currencySymbol, findInstrument, type CurrencyCode, type InstrumentSpec } from './instruments';

export type RiskUnit = 'percent' | 'currency';

export interface CalculatorInput {
  instrumentSymbol: string;
  depositCurrency: CurrencyCode;
  /** Raw field text, so "" and "abc" are distinguishable from 0. */
  openPrice: string;
  stopLossPrice: string;
  accountBalance: string;
  risk: string;
  riskUnit: RiskUnit;
}

export interface CalculatorResult {
  /** null when the instrument has no standardised lot — the screen shows "?". */
  lots: number | null;
  units: number;
  riskAmount: number;
  stopDistance: number;
  /** The stop distance in pips, for Forex pairs only (rounded to 0.1 pip). */
  pips: number | null;
  /** Deposit-currency value of one unit of the quote currency used for this result (1 when they match). */
  quoteToDeposit: number;
  depositCurrency: CurrencyCode;
  direction: 'long' | 'short';
  instrument: InstrumentSpec;
}

/**
 * String-discriminated on purpose: this project's tsconfig does not enable
 * `strict`, and without strictNullChecks a boolean-literal discriminant
 * (`ok: true | false`) does not narrow reliably in an if/else.
 */
export type CalculationOutcome =
  | { status: 'ok'; result: CalculatorResult }
  | { status: 'error'; error: string };

/** Parses a user-entered number, rejecting blanks and non-numeric text. */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Number() would accept "" and " ", and parseFloat would accept "12abc".
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * How much one unit of the quote currency is worth in the deposit currency.
 *
 * Same currency is always exact and never touches `usdRates` — that keeps the
 * common USD/USD case (and any other matching pair) working even if the FX
 * fetch failed or was never attempted, which is the one case this must never
 * depend on a network call for.
 *
 * Otherwise `usdRates` is the provider's own map of "1 USD buys this many
 * units of CODE" (open.er-api.com's shape — USD itself is implicit 1 and
 * never a key in it). Converting quote -> deposit is a cross-rate through
 * that common USD base: how many deposit-currency units one USD buys, divided
 * by how many quote-currency units one USD buys. When either side IS USD, its
 * factor is exactly 1 rather than a lookup, so a USD-quoted instrument never
 * compounds two roundings. A JPY-, CHF-, CAD-, AUD- or NZD-quoted Forex pair
 * uses the same cross-rate for its quote currency.
 *
 * Returns null — never an invented number — when no rate map was supplied, or
 * when it does not carry the currency this calculation needs.
 */
export function quoteToDepositRate(
  quote: CurrencyCode,
  deposit: CurrencyCode,
  usdRates?: Record<string, number> | null,
): number | null {
  if (quote === deposit) return 1;
  if (!usdRates) return null;

  const quoteFactor = quote === 'USD' ? 1 : usdRates[quote];
  const depositFactor = deposit === 'USD' ? 1 : usdRates[deposit];
  // Both factors are divisor and dividend of the cross-rate below, so either
  // one being non-finite or non-positive makes the result meaningless — a
  // currency's own USD rate is never legitimately zero or negative.
  if (!Number.isFinite(quoteFactor) || quoteFactor <= 0
      || !Number.isFinite(depositFactor) || depositFactor <= 0) {
    return null;
  }

  return depositFactor / quoteFactor;
}

export function calculatePositionSize(
  input: CalculatorInput,
  /** Already-fetched USD-based rates; omit or pass null when unavailable. */
  usdRates?: Record<string, number> | null,
): CalculationOutcome {
  const instrument = findInstrument(input.instrumentSymbol);
  if (!instrument) return { status: 'error', error: 'Choose an instrument.' };

  const openPrice = parseNumber(input.openPrice);
  const stopLossPrice = parseNumber(input.stopLossPrice);
  const accountBalance = parseNumber(input.accountBalance);
  const risk = parseNumber(input.risk);

  if (openPrice === null) return { status: 'error', error: 'Enter a valid open price.' };
  if (stopLossPrice === null) return { status: 'error', error: 'Enter a valid stop loss price.' };
  if (accountBalance === null) return { status: 'error', error: 'Enter a valid account balance.' };
  if (risk === null) return { status: 'error', error: 'Enter a valid risk value.' };

  if (openPrice <= 0) return { status: 'error', error: 'Open price must be greater than zero.' };
  if (stopLossPrice <= 0) return { status: 'error', error: 'Stop loss price must be greater than zero.' };
  if (accountBalance <= 0) return { status: 'error', error: 'Account balance must be greater than zero.' };
  if (risk <= 0) return { status: 'error', error: 'Risk must be greater than zero.' };

  if (input.riskUnit === 'percent' && risk > 100) {
    return { status: 'error', error: 'Risk cannot be more than 100% of the balance.' };
  }

  // Identical prices mean no stop at all, and would divide by zero below.
  if (openPrice === stopLossPrice) {
    return { status: 'error', error: 'Stop loss must be different from the open price.' };
  }

  const riskAmount = input.riskUnit === 'percent'
    ? (accountBalance * risk) / 100
    : risk;

  if (input.riskUnit === 'currency' && riskAmount > accountBalance) {
    return { status: 'error', error: 'Risk amount cannot be more than the account balance.' };
  }

  const rate = quoteToDepositRate(instrument.quoteCurrency, input.depositCurrency, usdRates);
  if (rate === null) {
    return {
      status: 'error',
      error: `Couldn't get a live ${instrument.quoteCurrency}/${input.depositCurrency} exchange rate. Please try again.`,
    };
  }

  const stopDistance = Math.abs(openPrice - stopLossPrice);
  // Long when the stop sits below entry, short when it sits above.
  const direction: 'long' | 'short' = stopLossPrice < openPrice ? 'long' : 'short';

  const units = riskAmount / (stopDistance * rate);
  // Units never depend on contract size; lots do, so they stay null for the
  // instruments where a lot is not standardised across brokers.
  const lots = instrument.contractSize === null ? null : units / instrument.contractSize;

  if (!Number.isFinite(units) || (lots !== null && !Number.isFinite(lots))) {
    return { status: 'error', error: 'Those values produce a position size that cannot be calculated.' };
  }

  // Price differences carry float noise (1.08500 - 1.08000 = 0.004999...), so
  // pips are rounded to the tenth of a pip that 5- and 3-decimal quotes show.
  const pips = instrument.pipSize === null ? null : Math.round((stopDistance / instrument.pipSize) * 10) / 10;

  return { status: 'ok', result: { lots, units, riskAmount, stopDistance, pips, quoteToDeposit: rate, depositCurrency: input.depositCurrency, direction, instrument } };
}

/** Broker values from the MT4/MT5 Symbol Specification, as typed. Only the contract size is required. */
export interface BrokerSpecInput {
  contractSize: string;
  minLot: string;
  maxLot: string;
  lotStep: string;
}

export interface MtLotResult {
  contractSize: number;
  /** Deposit-currency loss of 1.00 lot if the stop is hit: price move x contract size, converted. */
  lossPerLot: number;
  /** The exact size in lots: target risk / loss per lot, which is units / contract size. */
  theoreticalLots: number;
  /** What the platform accepts: rounded down to the lot step, within the limits. Null when nothing is. */
  executableLots: number | null;
  executableUnits: number | null;
  targetRisk: number;
  /** Estimated loss of the executable size at the stop. Null when no size is executable. */
  actualRisk: number | null;
  minLot: number | null;
  maxLot: number | null;
  lotStep: number | null;
  /**
   * none: rounded down to the lot step, within the limits.
   * not-rounded: no lot step was given, so the size is exact rather than executable.
   * capped: the target needs more than the maximum lot, so the maximum is used.
   * below-minimum: even the smallest order the broker accepts risks more than the target.
   */
  limit: 'none' | 'not-rounded' | 'capped' | 'below-minimum';
  /** The smallest order the broker accepts and its risk, when that is more than the target. */
  smallestLots: number | null;
  smallestRisk: number | null;
}

export type MtLotOutcome =
  | { status: 'ok'; mt: MtLotResult }
  | { status: 'error'; error: string };

/** Decimal places a lot step is written with (0.01 -> 2, 1 -> 0), so rounded lots print exactly. */
export function stepDecimals(step: number): number {
  const [mantissa, exponent] = step.toString().split('e');
  const decimals = (mantissa.split('.')[1] ?? '').length - (exponent ? Number(exponent) : 0);
  return Math.min(12, Math.max(0, decimals));
}

/**
 * Rounds a lot size DOWN to a whole number of steps. A size that is exactly
 * a whole number of steps but lands a hair under it in floating point
 * (0.46 / 0.01 = 45.99999999) still counts as that step; anything genuinely
 * short of the next step does not.
 */
export function floorToStep(lots: number, step: number): number {
  const steps = Math.floor(lots / step + 1e-9);
  return Number((steps * step).toFixed(stepDecimals(step)));
}

/** An optional broker limit: empty means "not given"; anything else must be a positive number. */
function optionalLimit(raw: string, name: string): { status: 'ok'; value: number | null } | { status: 'error'; error: string } {
  if (!raw.trim()) return { status: 'ok', value: null };
  const value = parseNumber(raw);
  if (value === null || value <= 0) return { status: 'error', error: `${name} must be a number greater than zero, or left empty.` };
  return { status: 'ok', value };
}

/**
 * MT4/MT5 volume for a position already sized by calculatePositionSize.
 *
 * Linear (Forex / CFD) profit calculation: a move of one price unit on one
 * lot gains or loses `contractSize` units of the quote currency, which is the
 * profit currency of every instrument offered here. So one lot loses
 * stopDistance x contractSize x quoteToDeposit at the stop, the exact size is
 * targetRisk / that (= units / contractSize), and the executable size is that
 * rounded DOWN to the lot step and kept within the minimum and maximum. When
 * even the minimum order would lose more than the target, no size is offered.
 */
export function calculateMtLots(result: CalculatorResult, input: BrokerSpecInput): MtLotOutcome {
  const label = result.instrument.label;
  if (!input.contractSize.trim()) {
    return { status: 'error', error: `Enter your broker's contract size for ${label}: the units in one lot, from its MT4/MT5 Symbol Specification.` };
  }
  const contractSize = parseNumber(input.contractSize);
  if (contractSize === null || contractSize <= 0) {
    return { status: 'error', error: 'Contract size must be a number greater than zero, without spaces or commas.' };
  }
  const min = optionalLimit(input.minLot, 'Minimum lot');
  if (min.status === 'error') return { status: 'error', error: min.error };
  const max = optionalLimit(input.maxLot, 'Maximum lot');
  if (max.status === 'error') return { status: 'error', error: max.error };
  const step = optionalLimit(input.lotStep, 'Lot step');
  if (step.status === 'error') return { status: 'error', error: step.error };
  const minLot = min.value;
  const maxLot = max.value;
  const lotStep = step.value;
  if (minLot !== null && maxLot !== null && maxLot < minLot) {
    return { status: 'error', error: 'Maximum lot cannot be smaller than the minimum lot.' };
  }
  // The smallest order the broker takes: the minimum lot (on the step grid), or one step.
  const smallestOrder = minLot !== null && lotStep !== null
    ? Number((Math.ceil(minLot / lotStep - 1e-9) * lotStep).toFixed(stepDecimals(lotStep)))
    : (minLot ?? lotStep);
  if (smallestOrder !== null && maxLot !== null && smallestOrder > maxLot * (1 + 1e-9)) {
    // e.g. minimum 0.5, step 0.2, maximum 0.5: the grid goes 0.4, 0.6, so no volume is allowed at all.
    return { status: 'error', error: 'These lot limits allow no volume at all: check the minimum lot, lot step and maximum lot.' };
  }

  const lossPerLot = result.stopDistance * contractSize * result.quoteToDeposit;
  const theoreticalLots = result.riskAmount / lossPerLot;
  if (!Number.isFinite(lossPerLot) || lossPerLot <= 0 || !Number.isFinite(theoreticalLots)) {
    return { status: 'error', error: 'Those values produce a lot size that cannot be calculated.' };
  }

  let lots = lotStep === null ? theoreticalLots : floorToStep(theoreticalLots, lotStep);
  let limit: MtLotResult['limit'] = lotStep === null ? 'not-rounded' : 'none';
  if (maxLot !== null) {
    const cap = lotStep === null ? maxLot : floorToStep(maxLot, lotStep);
    if (lots > cap) { lots = cap; limit = 'capped'; }
  }

  const base = { contractSize, lossPerLot, theoreticalLots, targetRisk: result.riskAmount, minLot, maxLot, lotStep };
  if (lots <= 0 || (minLot !== null && lots < minLot * (1 - 1e-9))) {
    // Only reachable when the target is below the smallest order (the limits
    // were checked above), so that order always risks more than the target.
    return {
      status: 'ok',
      mt: {
        ...base, executableLots: null, executableUnits: null, actualRisk: null, limit: 'below-minimum',
        smallestLots: smallestOrder, smallestRisk: smallestOrder === null ? null : smallestOrder * lossPerLot,
      },
    };
  }

  return {
    status: 'ok',
    mt: {
      ...base, executableLots: lots, executableUnits: lots * contractSize, actualRisk: lots * lossPerLot, limit,
      smallestLots: null, smallestRisk: null,
    },
  };
}

/**
 * Trims trailing zeros so 0.240000 reads as 0.24, and widens precision for
 * values that would otherwise round to a misleading "0.00" — a micro position
 * should read 0.0002, not zero and not 2.40e-4.
 */
export function formatSize(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  let decimals = maxDecimals;
  while (decimals < 8 && Math.abs(value) < 10 ** -decimals) decimals += 2;

  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

/**
 * Money at risk, e.g. "US$2,000.00". Always two decimals — this is an amount
 * of money, not a size, so trailing zeros are meaningful.
 */
export function formatMoney(value: number, currency: CurrencyCode): string {
  if (!Number.isFinite(value)) return '—';
  const amount = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol(currency)}${amount}`;
}
