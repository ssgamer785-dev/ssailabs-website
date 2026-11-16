/**
 * The symbols a trade can be logged on: exactly the Risk Calculator's
 * instruments (src/lib/calculator/instruments.ts), in its groups and order,
 * shown with its labels ("XAU/USD") and stored as its codes ("XAUUSD"). The
 * journal keeps no list of its own, so the two can never disagree; adding an
 * instrument to the calculator adds it here.
 *
 * Like the calculator, the picker offers no free-text symbol. A trade saved
 * earlier under a symbol that is not (or no longer) listed still shows, and
 * keeps that symbol when edited, until the member picks another.
 */
import { INSTRUMENTS, INSTRUMENT_GROUPS, findInstrument, type InstrumentGroup } from '../calculator/instruments';

export interface SymbolOption { symbol: string; label: string; group: InstrumentGroup }
export interface SymbolGroup { group: InstrumentGroup; options: SymbolOption[] }

export const SYMBOL_OPTIONS: readonly SymbolOption[] = INSTRUMENTS.map(({ symbol, label, group }) => ({ symbol, label, group }));
export const SYMBOL_GROUPS: readonly InstrumentGroup[] = INSTRUMENT_GROUPS;

/** What a stored symbol is called on screen: the calculator's label when it is one of its instruments. */
export function symbolLabel(symbol: string): string {
  return findInstrument(symbol)?.label ?? symbol;
}

export function isListedSymbol(symbol: string): boolean {
  return !!findInstrument(symbol);
}

const plain = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The instruments matching what was typed, grouped as in the calculator.
 * Matches the code or the label ignoring "/" and spaces ("xau", "eur/us",
 * "gbp jpy"), or a group's name ("crypto", "metals"). Within a group, symbols
 * that start with the search come first; otherwise the calculator's order.
 */
export function searchSymbols(query: string): SymbolGroup[] {
  const q = plain(query);
  const groupQuery = query.trim().toLowerCase();
  return SYMBOL_GROUPS.map(group => {
    const inGroup = SYMBOL_OPTIONS.filter(o => o.group === group);
    if (!q) return { group, options: inGroup };
    if (groupQuery.length >= 3 && group.toLowerCase().includes(groupQuery)) return { group, options: inGroup };
    const hits = inGroup.filter(o => plain(o.symbol).includes(q) || plain(o.label).includes(q));
    const starts = (o: SymbolOption) => plain(o.symbol).startsWith(q) ? 0 : 1;
    return { group, options: [...hits].sort((a, b) => starts(a) - starts(b)) };
  }).filter(g => g.options.length > 0);
}

/** The member's recently used symbols that are on the list, newest first (for one-tap reuse). */
export function recentSymbols(recent: readonly string[], limit = 6): SymbolOption[] {
  const seen = new Set<string>();
  const out: SymbolOption[] = [];
  for (const symbol of recent) {
    const option = SYMBOL_OPTIONS.find(o => o.symbol === symbol);
    if (!option || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(option);
    if (out.length === limit) break;
  }
  return out;
}
