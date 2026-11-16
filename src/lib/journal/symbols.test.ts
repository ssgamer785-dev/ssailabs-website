import { describe, expect, it } from 'bun:test';
import { INSTRUMENTS, INSTRUMENT_GROUPS } from '../calculator/instruments';
import { SYMBOL_GROUPS, SYMBOL_OPTIONS, isListedSymbol, recentSymbols, searchSymbols, symbolLabel } from './symbols';

describe('journal symbols are the Risk Calculator instruments', () => {
  it('offers exactly the calculator list: same symbols, labels, groups and order', () => {
    expect(SYMBOL_OPTIONS.map(o => [o.symbol, o.label, o.group])).toEqual(INSTRUMENTS.map(i => [i.symbol, i.label, i.group]));
    expect([...SYMBOL_GROUPS]).toEqual([...INSTRUMENT_GROUPS]);
    expect(SYMBOL_OPTIONS.length).toBe(INSTRUMENTS.length);
  });

  it('lists every group with all of its instruments when nothing is typed', () => {
    const groups = searchSymbols('');
    expect(groups.map(g => g.group)).toEqual([...INSTRUMENT_GROUPS]);
    expect(groups.flatMap(g => g.options).length).toBe(INSTRUMENTS.length);
  });

  it('finds by code or label, ignoring the slash, spaces and case', () => {
    const symbols = (q: string) => searchSymbols(q).flatMap(g => g.options.map(o => o.symbol));
    expect(symbols('xau')).toEqual(['XAUUSD']);
    expect(symbols('XAU/USD')).toEqual(['XAUUSD']);
    expect(symbols('gbp jpy')).toEqual(['GBPJPY']);
    expect(symbols('nas')).toEqual(['NAS100']);
    // Starts-with first inside a group: EURUSD before the pairs that merely contain EUR.
    expect(symbols('eur')[0]).toBe('EURUSD');
    expect(symbols('zzz')).toEqual([]);
  });

  it('a group name lists the whole group', () => {
    const crypto = searchSymbols('crypto');
    expect(crypto.length).toBe(1);
    expect(crypto[0].options.map(o => o.symbol)).toEqual(INSTRUMENTS.filter(i => i.group === 'Crypto').map(i => i.symbol));
  });

  it('labels a stored symbol the way the calculator does, and leaves an unlisted one as saved', () => {
    expect(symbolLabel('XAUUSD')).toBe('XAU/USD');
    expect(symbolLabel('US30')).toBe('US30');
    expect(symbolLabel('NIFTY')).toBe('NIFTY');
    expect(isListedSymbol('EURUSD')).toBe(true);
    expect(isListedSymbol('NIFTY')).toBe(false);
  });

  it('recent symbols: listed ones only, newest first, no repeats', () => {
    expect(recentSymbols(['NIFTY', 'EURUSD', 'XAUUSD', 'EURUSD', 'BTCUSD'], 3).map(o => o.symbol)).toEqual(['EURUSD', 'XAUUSD', 'BTCUSD']);
  });
});
