import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { DirectionBadge, JournalToast, resultColor } from '../components/journal/JournalParts';
import { JournalUnavailableError, getSummary, listTrades } from '../lib/journal/api';
import { takeJournalFlash } from '../lib/journal/flash';
import {
  DISCIPLINE_MIN_ANSWERS, EMPTY_SUMMARY, RANGES, disciplineScore, formatMoney, formatRiskReward, mistakeLabel, rangeShowing, resultLabel,
  shortDate, strategyWinRate, winRate, type JournalSummary, type JournalTrade, type RangeKey, type TradeResult,
} from '../lib/journal/model';
import { symbolLabel } from '../lib/journal/symbols';

type ResultFilter = TradeResult | 'all';
const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: 'all', label: 'All Trades' }, { key: 'profit', label: 'Profit' }, { key: 'loss', label: 'Loss' }, { key: 'breakeven', label: 'Breakeven' },
];
const isRange = (v: string | null): v is RangeKey => RANGES.some(r => r.key === v);
const isResult = (v: string | null): v is ResultFilter => RESULT_FILTERS.some(r => r.key === v);

function BookMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.6C10.2 5.3 7.6 4.7 3.6 4.9v13.4c4-.2 6.6.4 8.4 1.7 1.8-1.3 4.4-1.9 8.4-1.7V4.9c-4-.2-6.6.4-8.4 1.7z" /><path d="M12 6.8v12.6" />
    </svg>
  );
}

const icon = (d: string) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** One of the four figures. Every value is counted from the member's own saved trades. */
function Stat({ label, value, caption, tone, testId, children }: { label: string; value: string; caption?: ReactNode; tone?: 'up' | 'down'; testId: string; children?: ReactNode }) {
  return (
    <div data-testid={testId} className="jr-card" style={css('padding:13px 14px;display:flex;flex-direction:column;gap:6px;border-radius:16px')}>
      <div style={css('font-size:11.5px;font-weight:600;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{label}</div>
      <div data-testid={`${testId}-value`} style={{ ...css('font-size:20px;font-weight:700;letter-spacing:-.5px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums'),
        color: tone === 'up' ? 'var(--success-ink)' : tone === 'down' ? 'var(--danger-ink)' : 'var(--text-primary)' }}>{value}</div>
      {children}
      {caption && <div style={css('font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{caption}</div>}
    </div>
  );
}

function Insight({ icon: glyph, label, value, caption, testId, muted }: { icon: ReactNode; label: string; value: string; caption: string; testId: string; muted?: boolean }) {
  return (
    <div data-testid={testId} style={css('min-width:0;padding:12px;border-radius:14px;background:var(--surface-secondary);display:flex;flex-direction:column;gap:6px')}>
      <div style={css('display:flex;align-items:center;gap:7px;min-width:0')}>
        <span aria-hidden="true" style={css('width:26px;height:26px;flex:none;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--accent-ink)')}>{glyph}</span>
        <span style={css('font-size:11.5px;font-weight:600;color:var(--text-muted);line-height:1.25;min-width:0')}>{label}</span>
      </div>
      <div data-testid={`${testId}-value`} style={{ ...css('font-size:14.5px;font-weight:700;line-height:1.3;overflow-wrap:break-word;min-width:0'), color: muted ? 'var(--text-faint)' : 'var(--text-primary)' }}>{value}</div>
      <div style={css('font-size:11px;color:var(--text-faint);line-height:1.35')}>{caption}</div>
    </div>
  );
}

function TradeRow({ trade, highlight, onOpen }: { trade: JournalTrade; highlight: boolean; onOpen: () => void }) {
  const money = trade.pnlAmount !== null && trade.pnlCurrency ? formatMoney(trade.pnlAmount, trade.pnlCurrency) : null;
  const color = resultColor(trade.result);
  return (
    <button type="button" data-testid="journal-row" onClick={onOpen} className="row-focus jr-tap"
      aria-label={`${symbolLabel(trade.symbol)} ${trade.direction === 'buy' ? 'Buy' : 'Sell'}, ${shortDate(trade.tradeDate)}, R:R ${formatRiskReward(trade.riskReward)}, ${resultLabel[trade.result]}${money ? ` ${money}` : ''}`}
      style={{ ...css('width:100%;display:flex;align-items:center;gap:12px;padding:13px 14px;border:0;text-align:left;cursor:pointer;font:inherit;color:inherit'),
        background: highlight ? 'var(--accent-soft)' : 'transparent', transition: 'background-color .6s ease' }}>
      <span aria-hidden="true" style={{ ...css('width:4px;align-self:stretch;border-radius:4px;flex:none'), background: color, opacity: trade.result === 'breakeven' ? 0.4 : 0.85 }} />
      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
        <span style={css('display:flex;align-items:center;gap:7px;min-width:0')}>
          <span data-testid="row-symbol" style={css('font-size:14.5px;font-weight:700;letter-spacing:-.15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0')}>{symbolLabel(trade.symbol)}</span>
          <DirectionBadge direction={trade.direction} />
        </span>
        <span style={css('display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);white-space:nowrap;font-variant-numeric:tabular-nums')}>
          <span>{shortDate(trade.tradeDate)}</span>
          <span aria-hidden="true" style={css('color:var(--text-faint)')}>·</span>
          <span>R:R {formatRiskReward(trade.riskReward)}</span>
        </span>
      </span>
      <span style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;max-width:46%')}>
        <span style={{ ...css('font-size:14.5px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis'), color }}>{money ?? resultLabel[trade.result]}</span>
        {money && <span style={css('font-size:11px;font-weight:600;color:var(--text-faint);white-space:nowrap')}>{resultLabel[trade.result]}</span>}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}

export function JournalScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const range: RangeKey = isRange(params.get('range')) ? params.get('range') as RangeKey : 'month';
  const result: ResultFilter = isResult(params.get('result')) ? params.get('result') as ResultFilter : 'all';
  const scrollRef = useRef<HTMLDivElement>(null);

  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [trades, setTrades] = useState<JournalTrade[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const generation = useRef(0);

  const setFilter = (next: { range?: RangeKey; result?: ResultFilter }) => {
    const p = new URLSearchParams(params);
    const r = next.range ?? range;
    const f = next.result ?? result;
    if (r === 'month') p.delete('range'); else p.set('range', r);
    if (f === 'all') p.delete('result'); else p.set('result', f);
    setParams(p, { replace: true });
  };

  // Arriving from a save or a delete: say so, and make sure a just-saved trade is on screen.
  useEffect(() => {
    const flash = takeJournalFlash('saved', 'deleted');
    if (!flash) return;
    if (flash.kind === 'deleted') { setNotice('Trade deleted'); return; }
    setNotice('Trade saved');
    setHighlight(flash.id);
    const wanted = rangeShowing(flash.tradeDate, range);
    if (wanted !== range || result !== 'all') setFilter({ range: wanted, result: 'all' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setHighlight(null), 2400);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const load = useCallback(async () => {
    if (!user) return;
    const mine = ++generation.current;
    setProblem(null);
    try {
      const [nextSummary, page] = await Promise.all([getSummary(), listTrades(user.id, { range, result, offset: 0 })]);
      if (mine !== generation.current) return;
      setUnavailable(false);
      setSummary(nextSummary);
      setTrades(page.trades);
      setHasMore(page.hasMore);
    } catch (error) {
      if (mine !== generation.current) return;
      if (error instanceof JournalUnavailableError) { setUnavailable(true); setSummary(EMPTY_SUMMARY); setTrades([]); return; }
      setProblem(error instanceof Error ? error.message : 'Could not load your journal.');
    }
  }, [user, range, result]);

  useEffect(() => { setTrades(null); void load(); }, [load]);
  useRefreshHandler(load, !!user);

  const loadMore = async () => {
    if (!user || !trades || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listTrades(user.id, { range, result, offset: trades.length });
      setTrades(current => [...(current ?? []), ...page.trades.filter(t => !current?.some(c => c.id === t.id))]);
      setHasMore(page.hasMore);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load more trades.');
    } finally {
      setLoadingMore(false);
    }
  };

  const addTrade = () => navigate('/journal/new');
  const s = summary ?? EMPTY_SUMMARY;
  const rate = winRate(s);
  const mainPnl = s.pnl[0] ?? null;
  const discipline = disciplineScore(s);
  const firstLoad = summary === null || trades === null;
  const noTradesAtAll = !firstLoad && !unavailable && s.total === 0;
  const rangeLabel = RANGES.find(r => r.key === range)?.label ?? '';

  return (
    <PhoneShell scrollRef={scrollRef}>
      <header style={css('flex:none;display:flex;align-items:center;gap:12px;padding:12px 16px 10px 18px')}>
        <span aria-hidden="true" style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;flex:none')}><BookMark /></span>
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
          <h1 style={css('margin:0;font-size:19px;font-weight:700;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Trading Journal</h1>
          <div style={css('font-size:12px;color:var(--text-muted);white-space:nowrap')}>Track · Analyse · Improve</div>
        </div>
        <button type="button" onClick={addTrade} aria-label="Add trade" title="Add trade" className="pressable"
          style={css('flex:none;min-width:42px;height:42px;padding:0 15px 0 12px;border:0;border-radius:13px;background:linear-gradient(180deg,var(--accent-grad-a),var(--accent-grad-b));color:var(--on-accent);display:flex;align-items:center;justify-content:center;gap:6px;font-size:13.5px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(11,95,239,.24)')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className="jr-add-label">Add Trade</span>
        </button>
      </header>

      <div ref={scrollRef} className="nav-space" data-testid="journal-scroll"
        style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 16px 0;display:flex;flex-direction:column;gap:14px;background:var(--app-bg)')}>
        {unavailable && (
          <div role="status" style={css('flex:none;padding:14px;border-radius:14px;background:var(--warning-soft);border:1px solid var(--warning-border);color:var(--warning-ink);font-size:12.5px;line-height:1.5')}>
            The Trading Journal is almost ready: it needs a database update before trades can be saved. Please check back soon.
          </div>
        )}

        {problem && (
          <div role="alert" style={css('flex:none;display:flex;align-items:center;gap:10px;padding:12px 13px;border-radius:14px;background:var(--danger-soft);color:var(--danger-ink);font-size:12.5px')}>
            <span style={css('flex:1;min-width:0')}>{problem}</span>
            <button type="button" onClick={() => void load()} className="jr-chip pressable" style={css('flex:none')}>Try again</button>
          </div>
        )}

        {/* ---- The four figures: every one counted from the member's own saved trades ---- */}
        <div style={css('flex:none;margin-bottom:-6px;padding:0 4px;display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;color:var(--text-muted)')}>
          <span>Your performance</span><span style={css('font-weight:500;color:var(--text-faint)')}>All trades</span>
        </div>
        <section aria-label="Performance summary" className="jr-stats" style={{ flex: 'none', opacity: firstLoad ? 0.55 : 1, transition: 'opacity .2s ease' }}>
          <Stat testId="stat-total" label="Total Trades" value={firstLoad ? '–' : String(s.total)} caption={s.total ? `${s.wins} won · ${s.losses} lost · ${s.breakevens} even` : 'No trades yet'} />
          <Stat testId="stat-winrate" label="Win Rate" value={rate ?? '—'} caption={rate ? `${s.wins} of ${s.total} in profit` : 'No trades yet'}>
            <div aria-hidden="true" className="jr-progress" style={css('height:5px')}><i style={{ width: `${s.total ? Math.round((s.wins / s.total) * 100) : 0}%`, background: 'var(--success)' }} /></div>
          </Stat>
          <Stat testId="stat-pnl" label="Net P&L" value={mainPnl ? formatMoney(mainPnl.total, mainPnl.currency) : '—'}
            tone={mainPnl ? (mainPnl.total > 0 ? 'up' : mainPnl.total < 0 ? 'down' : undefined) : undefined}
            caption={mainPnl ? (s.pnl.length > 1 ? `${mainPnl.currency} · + ${s.pnl.length - 1} other currenc${s.pnl.length > 2 ? 'ies' : 'y'}` : `${mainPnl.trades} trade${mainPnl.trades === 1 ? '' : 's'} with an amount`) : 'No amounts yet'} />
          <Stat testId="stat-rr" label="Average R:R" value={s.averageRr ? formatRiskReward(s.averageRr) : '—'} caption={s.total ? `over ${s.total} trade${s.total === 1 ? '' : 's'}` : 'No trades yet'} />
        </section>
        {s.pnl.length > 1 && (
          <div data-testid="pnl-by-currency" style={css('flex:none;margin-top:-4px;padding:0 4px;font-size:11.5px;color:var(--text-muted);line-height:1.5')}>
            Net P&amp;L per currency (never added together):{' '}
            {s.pnl.map((p, i) => (
              <span key={p.currency}>{i ? ' · ' : ''}<strong style={{ color: p.total > 0 ? 'var(--success-ink)' : p.total < 0 ? 'var(--danger-ink)' : 'var(--text-primary)' }}>{formatMoney(p.total, p.currency)}</strong></span>
            ))}
          </div>
        )}

        {noTradesAtAll ? (
          <section data-testid="journal-empty" className="jr-card" style={css('margin-top:2px;padding:32px 22px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px')}>
            <span aria-hidden="true" style={css('width:60px;height:60px;border-radius:18px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center')}><BookMark size={30} /></span>
            <h2 style={css('margin:6px 0 0;font-size:17px;font-weight:700;letter-spacing:-.3px')}>No trades added yet</h2>
            <p style={css('margin:0;font-size:13px;color:var(--text-muted);line-height:1.5;max-width:270px')}>Start tracking your trades to understand your performance.</p>
            <button type="button" onClick={addTrade} className="pressable"
              style={css('margin-top:8px;height:46px;padding:0 22px;border:0;border-radius:13px;background:linear-gradient(180deg,var(--accent-grad-a),var(--accent-grad-b));color:var(--on-accent);font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(11,95,239,.22)')}>
              Add Your First Trade
            </button>
          </section>
        ) : !unavailable && (
          <>
            {/* ---- The trades, with their filters: no chart pictures here; a trade's screenshot is on its own page ---- */}
            <section aria-label="Trades" className="jr-card" style={css('overflow:hidden')}>
              <div style={css('padding:12px 12px 10px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--surface-divider)')}>
                <div role="radiogroup" aria-label="Result" className="jr-filter">
                  {RESULT_FILTERS.map(f => (
                    <button key={f.key} type="button" role="radio" aria-checked={f.key === result} onClick={() => setFilter({ result: f.key })}>{f.label}</button>
                  ))}
                </div>
                <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px')}>
                  <div data-testid="journal-count" style={css('font-size:12px;font-weight:600;color:var(--text-muted)')}>
                    {trades ? `${trades.length}${hasMore ? '+' : ''} trade${trades.length === 1 ? '' : 's'}` : 'Loading…'}
                  </div>
                  <label style={css('position:relative;display:flex;align-items:center')}>
                    <span style={css('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)')}>Date range</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={css('position:absolute;left:11px;pointer-events:none')}><path d="M5 6h14v13H5zM5 10h14M9 4v4M15 4v4" /></svg>
                    <select value={range} onChange={e => setFilter({ range: e.target.value as RangeKey })} aria-label="Date range"
                      style={css('appearance:none;-webkit-appearance:none;height:36px;padding:0 30px 0 32px;border-radius:999px;border:1px solid var(--accent-border-2);background:var(--accent-tint-2);color:var(--accent-ink);font-size:12.5px;font-weight:700;cursor:pointer')}>
                      {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={2.6} strokeLinecap="round" style={css('position:absolute;right:12px;pointer-events:none')} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </label>
                </div>
              </div>
              {trades === null ? (
                <div style={css('padding:26px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:12.5px;color:var(--text-faint)')}><span className="jr-spinner" style={css('color:var(--accent)')} />Loading trades…</div>
              ) : trades.length === 0 ? (
                <div data-testid="journal-filter-empty" style={css('padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;font-size:13px;color:var(--text-muted)')}>
                  No {result === 'all' ? '' : `${resultLabel[result as TradeResult].toLowerCase()} `}trades in {rangeLabel.toLowerCase()}.
                  {(range !== 'all' || result !== 'all') && (
                    <button type="button" onClick={() => setFilter({ range: 'all', result: 'all' })} className="jr-chip pressable">Show all trades</button>
                  )}
                </div>
              ) : (
                <ul style={css('list-style:none;margin:0;padding:0')}>
                  {trades.map((t, i) => (
                    <li key={t.id} style={i ? css('border-top:1px solid var(--surface-divider)') : undefined}>
                      <TradeRow trade={t} highlight={t.id === highlight} onOpen={() => navigate(`/journal/trade/${t.id}`)} />
                    </li>
                  ))}
                </ul>
              )}
              {hasMore && (
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="jr-tap"
                  style={css('width:100%;height:48px;border:0;border-top:1px solid var(--surface-divider);background:transparent;font-size:13px;font-weight:700;color:var(--accent-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px')}>
                  {loadingMore ? <><span className="jr-spinner" />Loading…</> : 'Show older trades'}
                </button>
              )}
            </section>

            {/* ---- Trade Analytics: from the member's own records only; "Not enough data" rather than a guess ---- */}
            <section aria-labelledby="journal-analytics-title" className="jr-card" style={css('padding:16px 14px 14px;display:flex;flex-direction:column;gap:12px')}>
              <h2 id="journal-analytics-title" style={css('margin:0;padding:0 2px;font-size:15px;font-weight:700;letter-spacing:-.25px;display:flex;align-items:center;gap:8px')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent-ink)" aria-hidden="true"><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="7" width="3.6" height="13" rx="1" /><rect x="16.4" y="3.5" width="3.6" height="16.5" rx="1" /></svg>
                Trade Analytics
                <span style={css('margin-left:auto;font-size:11px;font-weight:600;color:var(--text-faint)')}>All your trades</span>
              </h2>
              <div className="jr-insights">
                <Insight testId="insight-strategy" icon={icon('M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1M21 3l-9 9')} label="Best Strategy"
                  value={s.bestStrategy ? s.bestStrategy.name : 'Not enough data'} muted={!s.bestStrategy}
                  caption={s.bestStrategy ? `${strategyWinRate(s.bestStrategy)} win rate · ${s.bestStrategy.trades} trades` : 'Needs 3+ trades with one strategy'} />
                <Insight testId="insight-symbol" icon={icon('M4 19V9M9.5 19V5M15 19v-7M20.5 19V8')} label="Most Traded Symbol"
                  value={s.topSymbol ? symbolLabel(s.topSymbol.symbol) : 'Not enough data'} muted={!s.topSymbol}
                  caption={s.topSymbol ? `${s.topSymbol.trades} trade${s.topSymbol.trades === 1 ? '' : 's'}` : 'No trades yet'} />
                <Insight testId="insight-mistake" icon={icon('M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2h.01')} label="Top Mistake"
                  value={s.topMistake ? mistakeLabel(s.topMistake.tag) : 'Not enough data'} muted={!s.topMistake}
                  caption={s.topMistake ? `${s.topMistake.times} time${s.topMistake.times === 1 ? '' : 's'}` : 'Tag mistakes when you add a trade'} />
                <Insight testId="insight-discipline" icon={icon('M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6zM8.6 12.2l2.4 2.4 4.4-4.6')} label="Discipline Score"
                  value={discipline === null ? 'Not enough data' : `${discipline} / 10`} muted={discipline === null}
                  caption={discipline === null
                    ? `Answer "followed my plan" on ${DISCIPLINE_MIN_ANSWERS}+ trades`
                    : `Plan followed in ${s.discipline.followed} of ${s.discipline.answered} trades`} />
              </div>
            </section>
          </>
        )}
        <div aria-hidden="true" style={css('flex:none;height:8px')} />
      </div>
      <JournalToast message={notice} tone={notice === 'Trade deleted' ? 'neutral' : 'good'} aboveNav />
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
