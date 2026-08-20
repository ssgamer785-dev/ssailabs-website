/**
 * Instrument specifications for the Risk Calculator.
 *
 * Nothing in the app previously carried contract-size or tick information —
 * the old screen multiplied by a hard-coded 46.08, which is only correct for
 * one instrument. Position sizing genuinely cannot be done without this, so
 * the specs live here, in one place, rather than being guessed per instrument.
 *
 * `contractSize` is units of the base asset in one standard lot. These are the
 * conventional retail values; a specific broker can differ (index and crypto
 * CFDs especially), so treat this file as the thing to edit when onboarding a
 * broker rather than scattering the numbers through the UI.
 */

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR';

export interface InstrumentSpec {
  /** Value stored/compared internally. */
  symbol: string;
  /** Exactly what the dropdown shows, e.g. "XAU/USD". */
  label: string;
  /** Units of the base asset per 1.00 lot. */
  contractSize: number;
  /** Currency a price is denominated in — profit/loss lands in this currency. */
  quoteCurrency: CurrencyCode;
  /** Decimals to display/accept on price fields. */
  pricePrecision: number;
}

/**
 * Every supported instrument is USD-quoted, so a USD account needs no FX
 * conversion. Adding a non-USD-quoted instrument means adding a rate source —
 * see `quoteToDepositRate` in position-size.ts.
 */
export const INSTRUMENTS: InstrumentSpec[] = [
  { symbol: 'XAUUSD', label: 'XAU/USD', contractSize: 100, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'XAGUSD', label: 'XAG/USD', contractSize: 5000, quoteCurrency: 'USD', pricePrecision: 3 },
  { symbol: 'EURUSD', label: 'EUR/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5 },
  { symbol: 'GBPUSD', label: 'GBP/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5 },
  { symbol: 'AUDUSD', label: 'AUD/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5 },
  { symbol: 'NZDUSD', label: 'NZD/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5 },
  { symbol: 'US30', label: 'US30', contractSize: 1, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'NAS100', label: 'NAS100', contractSize: 1, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'SPX500', label: 'SPX500', contractSize: 1, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'USOIL', label: 'USOIL', contractSize: 1000, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'BTCUSD', label: 'BTC/USD', contractSize: 1, quoteCurrency: 'USD', pricePrecision: 2 },
  { symbol: 'ETHUSD', label: 'ETH/USD', contractSize: 1, quoteCurrency: 'USD', pricePrecision: 2 },
];

export const DEPOSIT_CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'INR', label: 'Indian Rupee' },
];

export function findInstrument(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS.find(i => i.symbol === symbol);
}
