/**
 * Instrument specifications for the Risk Calculator.
 *
 * Nothing in the app previously carried contract-size or tick information —
 * the old screen multiplied by a hard-coded 46.08, which is only correct for
 * one instrument. Position sizing genuinely cannot be done without this, so
 * the specs live here, in one place, rather than being guessed per instrument.
 */

/** Deposit currencies (USD, EUR, GBP, INR) and the quote currencies of the Forex pairs. */
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'NZD'
  | 'SGD' | 'HKD' | 'ZAR' | 'MXN' | 'TRY' | 'SEK' | 'NOK' | 'PLN' | 'CNH';

export type InstrumentGroup = 'Metals' | 'Forex majors' | 'Forex crosses' | 'Forex exotics' | 'Energy' | 'Indices' | 'Crypto';

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
  /**
   * One pip in price terms, for Forex only: 0.0001, or 0.01 when the quote
   * currency is JPY. Null where brokers define a pip differently (metals,
   * oil, indices, crypto); those show the stop distance in points only.
   */
  pipSize: number | null;
  /** Heading the instrument is listed under in the dropdown. */
  group: InstrumentGroup;
  /** Ticker used when opening an external chart for this instrument. */
  chartSymbol: string;
}

/** 1 standard lot = 100,000 units of the base currency on every Forex pair. */
const FX_CONTRACT_SIZE = 100_000;

/**
 * A Forex pair from its six-letter symbol. Everything here follows the market
 * convention, not a broker's choice: base = first three letters, quote = last
 * three, a standard lot of 100,000 base units, and a pip of 0.01 for
 * JPY-quoted pairs (priced to 3 decimals) or 0.0001 otherwise (5 decimals).
 */
function forexPair(symbol: string, group: 'Forex majors' | 'Forex crosses' | 'Forex exotics', chartSymbol = `OANDA:${symbol}`): InstrumentSpec {
  const quote = symbol.slice(3) as CurrencyCode;
  const jpy = quote === 'JPY';
  return {
    symbol,
    label: `${symbol.slice(0, 3)}/${quote}`,
    contractSize: FX_CONTRACT_SIZE,
    quoteCurrency: quote,
    pricePrecision: jpy ? 3 : 5,
    pipSize: jpy ? 0.01 : 0.0001,
    group,
    chartSymbol,
  };
}

/**
 * Pairs not quoted in the account's currency are converted with the day's
 * reference rate from /api/fx/rates — see `quoteToDepositRate` in
 * position-size.ts. The first entry is the dropdown's default.
 */
export const INSTRUMENTS: InstrumentSpec[] = [
  { symbol: 'XAUUSD', label: 'XAU/USD', contractSize: 100, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Metals', chartSymbol: 'OANDA:XAUUSD' },
  { symbol: 'XAGUSD', label: 'XAG/USD', contractSize: 5000, quoteCurrency: 'USD', pricePrecision: 3, pipSize: null, group: 'Metals', chartSymbol: 'OANDA:XAGUSD' },
  // The seven majors.
  forexPair('EURUSD', 'Forex majors', 'FX:EURUSD'),
  forexPair('GBPUSD', 'Forex majors', 'FX:GBPUSD'),
  forexPair('USDJPY', 'Forex majors'),
  forexPair('USDCHF', 'Forex majors'),
  forexPair('USDCAD', 'Forex majors'),
  forexPair('AUDUSD', 'Forex majors', 'FX:AUDUSD'),
  forexPair('NZDUSD', 'Forex majors', 'FX:NZDUSD'),
  // The 21 crosses between the same eight currencies.
  ...['EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD',
    'GBPJPY', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
    'AUDJPY', 'AUDCHF', 'AUDCAD', 'AUDNZD',
    'NZDJPY', 'NZDCHF', 'NZDCAD',
    'CADJPY', 'CADCHF',
    'CHFJPY'].map(symbol => forexPair(symbol, 'Forex crosses')),
  // Exotics: a major currency against a smaller or emerging-market one. Same
  // lot and pip conventions; each quote currency's reference rate comes from
  // the same source (CNH is the offshore yuan, not the onshore CNY).
  ...['USDSGD', 'USDHKD', 'USDZAR', 'USDMXN', 'USDTRY', 'USDSEK', 'USDNOK', 'USDPLN', 'USDCNH',
    'EURTRY', 'EURSEK', 'EURNOK'].map(symbol => forexPair(symbol, 'Forex exotics')),
  { symbol: 'USOIL', label: 'USOIL', contractSize: 1000, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Energy', chartSymbol: 'TVC:USOIL' },
  // Broker-dependent lot definitions — Units only, Lots shows "?".
  { symbol: 'US30', label: 'US30', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Indices', chartSymbol: 'TVC:DJI' },
  { symbol: 'NAS100', label: 'NAS100', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Indices', chartSymbol: 'TVC:NDX' },
  { symbol: 'SPX500', label: 'SPX500', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Indices', chartSymbol: 'TVC:SPX' },
  { symbol: 'BTCUSD', label: 'BTC/USD', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Crypto', chartSymbol: 'BITSTAMP:BTCUSD' },
  { symbol: 'ETHUSD', label: 'ETH/USD', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Crypto', chartSymbol: 'BITSTAMP:ETHUSD' },
  { symbol: 'SOLUSD', label: 'SOL/USD', contractSize: null, quoteCurrency: 'USD', pricePrecision: 2, pipSize: null, group: 'Crypto', chartSymbol: 'BITSTAMP:SOLUSD' },
];

/** Dropdown headings in display order. */
export const INSTRUMENT_GROUPS: InstrumentGroup[] = ['Metals', 'Forex majors', 'Forex crosses', 'Forex exotics', 'Energy', 'Indices', 'Crypto'];

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
