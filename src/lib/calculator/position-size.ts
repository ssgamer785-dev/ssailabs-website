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

import { findInstrument, type CurrencyCode, type InstrumentSpec } from './instruments';

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
  lots: number;
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
 * Every instrument in the spec list is USD-quoted, so a USD account is 1:1 and
 * exact. Any other deposit currency needs a live FX rate the app does not have,
 * and inventing one would silently produce wrong position sizes — so this
 * returns null and the caller surfaces that instead of calculating.
 */
export function quoteToDepositRate(
  quote: CurrencyCode,
  deposit: CurrencyCode,
): number | null {
  return quote === deposit ? 1 : null;
}

export function calculatePositionSize(input: CalculatorInput): CalculationOutcome {
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

  const rate = quoteToDepositRate(instrument.quoteCurrency, input.depositCurrency);
  if (rate === null) {
    return {
      status: 'error',
      error: `${instrument.label} settles in ${instrument.quoteCurrency}. Sizing a ${input.depositCurrency} account needs a live ${instrument.quoteCurrency}/${input.depositCurrency} rate, which isn't configured — switch the deposit currency to US Dollar.`,
    };
  }

  const stopDistance = Math.abs(openPrice - stopLossPrice);
  // Long when the stop sits below entry, short when it sits above.
  const direction: 'long' | 'short' = stopLossPrice < openPrice ? 'long' : 'short';

  const units = riskAmount / (stopDistance * rate);
  const lots = units / instrument.contractSize;

  if (!Number.isFinite(units) || !Number.isFinite(lots)) {
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
