/**
 * Instrument specifications for the Risk Calculator.
 *
 * Nothing in the app previously carried contract-size or tick information —
 * the old screen multiplied by a hard-coded 46.08, which is only correct for
 * one instrument. Position sizing genuinely cannot be done without this, so
 * the specs live here, in one place, rather than being guessed per instrument.
 */

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR';

export interface InstrumentSpec {
  /** Value stored/compared internally. */
  symbol: string;
  /** Exactly what the dropdown and chart links show, e.g. "XAU/USD". */
  label: string;
  /**
   * Units of the base asset per 1.00 lot, or null when a lot is not
   * standardised across brokers.
   *
   * FX majors (100,000), metals and oil are conventional enough to size
   * against. Index and crypto CFDs are not — brokers disagree on what one lot
   * means, so quoting a number here would be inventing one. Those return null
   * and the screen shows "?" for Lots while still showing Units, which never
   * depend on contract size.
   */
  contractSize: number | null;
  /** Currency a price is denominated in — profit/loss lands in this currency. */
  quoteCurrency: CurrencyCode;
  /** Decimals to display/accept on price fields. */
  pricePrecision: number;
  /** Ticker used when opening an external chart for this instrument. */
  chartSymbol: string;
}

/**
 * Every supported instrument is USD-quoted, so a USD account needs no FX
 * conversion. Adding a non-USD-quoted instrument means adding a rate source —
 * see `quoteToDepositRate` in position-size.ts.
 */
export const INSTRUMENTS: InstrumentSpec[] = [
  { symbol: 'XAUUSD', label: 'XAU/USD', contractSize: 100, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'OANDA:XAUUSD' },
  { symbol: 'XAGUSD', label: 'XAG/USD', contractSize: 5000, quoteCurrency: 'USD', pricePrecision: 3, chartSymbol: 'OANDA:XAGUSD' },
  { symbol: 'EURUSD', label: 'EUR/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5, chartSymbol: 'FX:EURUSD' },
  { symbol: 'GBPUSD', label: 'GBP/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5, chartSymbol: 'FX:GBPUSD' },
  { symbol: 'AUDUSD', label: 'AUD/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5, chartSymbol: 'FX:AUDUSD' },
  { symbol: 'NZDUSD', label: 'NZD/USD', contractSize: 100000, quoteCurrency: 'USD', pricePrecision: 5, chartSymbol: 'FX:NZDUSD' },
  { symbol: 'USOIL', label: 'USOIL', contractSize: 1000, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'TVC:USOIL' },
  // Broker-dependent lot definitions — Units only, Lots shows "?".
  { symbol: 'US30', label: 'US30', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'TVC:DJI' },
  { symbol: 'NAS100', label: 'NAS100', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'TVC:NDX' },
  { symbol: 'SPX500', label: 'SPX500', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'TVC:SPX' },
  { symbol: 'BTCUSD', label: 'BTC/USD', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'BITSTAMP:BTCUSD' },
  { symbol: 'ETHUSD', label: 'ETH/USD', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, chartSymbol: 'BITSTAMP:ETHUSD' },
];

export const DEPOSIT_CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar', symbol: 'US$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
];

export function findInstrument(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS.find(i => i.symbol === symbol);
}

export function currencySymbol(code: CurrencyCode): string {
  return DEPOSIT_CURRENCIES.find(c => c.code === code)?.symbol ?? '';
}

/** External chart for an instrument. Opened in a new tab from the results. */
export function liveChartUrl(spec: InstrumentSpec): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(spec.chartSymbol)}`;
}

export function historicalChartUrl(spec: InstrumentSpec): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(spec.chartSymbol.replace(':', '-'))}/`;
}
