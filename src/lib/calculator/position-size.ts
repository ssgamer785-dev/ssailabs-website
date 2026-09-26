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
 * factor is exactly 1 rather than a lookup, which is also what keeps this
 * exact for every instrument today (all USD-quoted) instead of compounding
 * two roundings for no reason.
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

  return { status: 'ok', result: { lots, units, riskAmount, stopDistance, direction, instrument } };
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
