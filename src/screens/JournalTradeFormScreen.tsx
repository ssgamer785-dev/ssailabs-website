import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { PhoneShell } from '../components/PhoneShell';
import { ConfirmDialog, JournalScreenshot } from '../components/journal/JournalParts';
import {
  JournalUnavailableError, createTrade, discardScreenshots, getTrade, recentChoices, requestScreenshotUpload, updateTrade, uploadScreenshot,
  type ScreenshotFields,
} from '../lib/journal/api';
import { setJournalFlash } from '../lib/journal/flash';
import {
  CURRENCIES, MISTAKES, NOTES_MAX, STRATEGY_MAX, SYMBOL_MAX, currencySymbol, draftFromTrade, emptyDraft, localDateString, screenshotProblem,
  symbolSuggestions, validateDraft, type Currency, type DraftField, type DraftProblems, type JournalTrade, type MistakeTag, type TradeDraft,
} from '../lib/journal/model';
import { normalizePickedFile } from '../lib/media/file-types';
import { PortableImageError, toPortableImage } from '../lib/media/portable-image';
import { measureImage } from '../lib/media/dimensions';

const CURRENCY_KEY = 'tp.journal.currency';
const draftKey = (userId: string) => `tp.journal.draft.${userId}`;

function lastCurrency(): Currency {
  try { const c = localStorage.getItem(CURRENCY_KEY); return (CURRENCIES as readonly string[]).includes(c ?? '') ? c as Currency : 'USD'; } catch { return 'USD'; }
}
function readDraft(userId: string | undefined): TradeDraft | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = { ...emptyDraft(lastCurrency()), ...JSON.parse(raw) } as TradeDraft;
    return typeof draft.symbol === 'string' && typeof draft.notes === 'string' ? draft : null;
  } catch { return null; }
}
function writeDraft(userId: string | undefined, draft: TradeDraft | null) {
  if (!userId) return;
  try { if (draft) localStorage.setItem(draftKey(userId), JSON.stringify(draft)); else localStorage.removeItem(draftKey(userId)); } catch { /* private mode: no autosave */ }
}

interface Picture { file: File; previewUrl: string; width: number | null; height: number | null }

const input = css('width:100%;min-width:0;height:42px;border-radius:11px;border:1px solid var(--border-4);background:var(--surface-secondary);padding:0 12px;font-size:14.5px;color:var(--text-primary)');

function Row({ id, icon, label, problem, children, stacked }: { id: string; icon: ReactNode; label: string; problem?: string; children: ReactNode; stacked?: boolean }) {
  return (
    <div id={`field-${id}`} style={css('padding:12px 14px;display:flex;flex-direction:column;gap:8px')}>
      <div style={css(stacked ? 'display:flex;flex-direction:column;gap:9px' : 'display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
        {/* In a row the label takes its share of the width; stacked, it is just a line (a basis there would be a height). */}
        <div style={css(`${stacked ? 'flex:none' : 'flex:1 0 116px'};display:flex;align-items:center;gap:9px;min-width:0`)}>
          <span aria-hidden="true" style={css('width:28px;height:28px;border-radius:9px;background:var(--accent-tint);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;flex:none')}>{icon}</span>
          <span style={css('font-size:13px;font-weight:600;color:var(--text-primary)')}>{label}</span>
        </div>
        <div style={css(stacked ? 'min-width:0' : 'flex:1 1 180px;min-width:0')}>{children}</div>
      </div>
      {problem && <div role="alert" style={css('font-size:11.5px;color:var(--danger-ink);line-height:1.4')}>{problem}</div>}
    </div>
  );
}

function Choice({ on, onClick, children, tone, label }: { on: boolean; onClick: () => void; children: ReactNode; tone?: 'up' | 'down' | 'neutral'; label?: string }) {
  const color = tone === 'up' ? 'var(--success-ink)' : tone === 'down' ? 'var(--danger-ink)' : 'var(--accent-ink)';
  const soft = tone === 'up' ? 'var(--success-soft)' : tone === 'down' ? 'var(--danger-soft)' : 'var(--accent-tint)';
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={label} onClick={onClick} className="pressable"
      style={{ ...css('flex:1;min-width:0;height:40px;padding:0 8px;border-radius:11px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;justify-content:center;gap:5px'),
        border: `1.5px solid ${on ? color : 'var(--border-4)'}`, background: on ? soft : 'var(--surface)', color: on ? color : 'var(--text-secondary)' }}>
      {children}
    </button>
  );
}

function Chip({ on, onClick, children, label }: { on?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} className="pressable"
      style={{ ...css('height:30px;padding:0 11px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap'),
        border: `1px solid ${on ? 'var(--accent)' : 'var(--border-4)'}`, background: on ? 'var(--accent-tint)' : 'var(--surface)', color: on ? 'var(--accent-ink)' : 'var(--text-secondary)' }}>
      {children}
    </button>
  );
}

const i = (d: string) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS = {
  date: i('M5 6h14v13H5zM5 10h14M9 4v4M15 4v4'),
  symbol: i('M12 3 3 8l9 5 9-5zM3 13l9 5 9-5'),
  direction: i('M7 17V5M3.5 8.5 7 5l3.5 3.5M17 7v12M13.5 15.5 17 19l3.5-3.5'),
  rr: i('M12 4v16M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z'),
  result: i('M8 4h8v4a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 12v4M9 20h6M10 16h4v4h-4z'),
  money: i('M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4'),
  strategy: i('M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1M21 3l-9 9'),
  mistakes: i('M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2h.01'),
  picture: i('M4 5h16v14H4zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 15l-5-5-9 9'),
};

export function JournalTradeFormScreen() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id;

  const restoredDraft = useMemo(() => (editing ? null : readDraft(userId)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<TradeDraft>(() => restoredDraft ?? emptyDraft(lastCurrency()));
  const [baseline, setBaseline] = useState(() => JSON.stringify(restoredDraft ?? emptyDraft(lastCurrency())));
  const [restored, setRestored] = useState(!!restoredDraft);
  const [original, setOriginal] = useState<JournalTrade | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error' | 'unavailable'>(editing ? 'loading' : 'ready');
  const [choices, setChoices] = useState<{ symbols: string[]; strategies: string[] }>({ symbols: [], strategies: [] });
  const [showProblems, setShowProblems] = useState(false);
  const [symbolFocus, setSymbolFocus] = useState(false);

  const [picture, setPicture] = useState<Picture | null>(null);
  const [keepExisting, setKeepExisting] = useState(true);
  const [pictureProblem, setPictureProblem] = useState<string | null>(null);
  const pictureInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; key: string } | null>(null);
  const pictureUrl = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const submitting = useRef(false);
  const saved = useRef(false);
  const formScroll = useRef<HTMLDivElement>(null);
  const today = localDateString();

  // Editing: the trade as saved.
  useEffect(() => {
    if (!id) return;
    let live = true;
    getTrade(id).then(trade => {
      if (!live) return;
      if (!trade) { setLoadState('missing'); return; }
      const next = draftFromTrade(trade, lastCurrency());
      setOriginal(trade);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setLoadState('ready');
    }).catch(error => { if (live) setLoadState(error instanceof JournalUnavailableError ? 'unavailable' : 'error'); });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void recentChoices(userId).then(next => { if (live) setChoices(next); });
    return () => { live = false; };
  }, [userId]);

  const dirty = JSON.stringify(draft) !== baseline || !!picture || (editing && !!original?.screenshot && !keepExisting);

  // A new trade is kept on this device as it is typed, so nothing is lost to a reload or a stray Back.
  useEffect(() => {
    if (editing || saved.current) return;
    writeDraft(userId, JSON.stringify(draft) === JSON.stringify(emptyDraft(draft.currency)) ? null : draft);
  }, [draft, editing, userId]);

  // Closing the tab or reloading with unsaved work asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { if (!saved.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Leaving without saving: an uploaded picture no trade uses is removed; the preview is freed.
  useEffect(() => () => {
    if (uploaded.current && !saved.current) void discardScreenshots([uploaded.current.key]);
    if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current);
  }, []);

  // The keyboard covers the bottom of the screen without resizing the page: keep the field being typed in above it.
  useEffect(() => {
    const viewport = window.visualViewport;
    const box = formScroll.current;
    if (!viewport || !box) return;
    const reveal = () => {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !box.contains(field)) return;
      const hidden = field.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height) + 16;
      if (hidden > 0) box.scrollBy({ top: hidden });
    };
    viewport.addEventListener('resize', reveal);
    return () => viewport.removeEventListener('resize', reveal);
  }, [loadState]);

  const problems: DraftProblems = showProblems ? validateDraft(draft).problems : {};
  const set = <K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) => { setDraft(d => ({ ...d, [key]: value })); setSaveError(null); };

  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(editing && id ? `/journal/trade/${id}` : '/journal', { replace: true });
  };
  const leave = () => { if (dirty && !busy) setConfirmLeave(true); else if (!busy) goBack(); };
  const discardAndLeave = () => {
    if (!editing) writeDraft(userId, null);
    setConfirmLeave(false);
    goBack();
  };

  async function pickPicture(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    event.target.value = '';
    if (!raw) return;
    setPictureProblem(null);
    let file = normalizePickedFile(raw);
    try { file = await toPortableImage(file); }
    catch (error) {
      if (error instanceof PortableImageError) { setPictureProblem(error.message); return; }
      setPictureProblem('That picture could not be read. Try another one.');
      return;
    }
    const problem = screenshotProblem(file);
    if (problem) { setPictureProblem(problem); return; }
    const size = await measureImage(file);
    if (uploaded.current && !saved.current) { void discardScreenshots([uploaded.current.key]); uploaded.current = null; }
    if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current);
    const previewUrl = URL.createObjectURL(file);
    pictureUrl.current = previewUrl;
    setPicture({ file, previewUrl, width: size?.width ?? null, height: size?.height ?? null });
    setSaveError(null);
  }

  function removePicture() {
    if (picture) {
      if (uploaded.current && !saved.current) { void discardScreenshots([uploaded.current.key]); uploaded.current = null; }
      if (pictureUrl.current) { URL.revokeObjectURL(pictureUrl.current); pictureUrl.current = null; }
      setPicture(null);
    } else {
      setKeepExisting(false);
    }
  }

  async function save() {
    if (submitting.current) return;
    setShowProblems(true);
    const { problems: found, values } = validateDraft(draft);
    if (!values) {
      const first = (['tradeDate', 'symbol', 'direction', 'riskReward', 'result', 'amount', 'strategy', 'notes'] as DraftField[]).find(f => found[f]);
      const anchor = first === 'amount' ? 'result' : first;
      if (anchor) document.getElementById(`field-${anchor}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      const existing = editing && original?.screenshot && keepExisting ? original.screenshot : null;
      let shot: ScreenshotFields = existing
        ? { screenshot_key: existing.key, screenshot_mime: existing.mime, screenshot_width: existing.width, screenshot_height: existing.height }
        : { screenshot_key: null, screenshot_mime: null, screenshot_width: null, screenshot_height: null };
      if (picture) {
        if (!uploaded.current || uploaded.current.file !== picture.file) {
          const ticket = await requestScreenshotUpload(picture.file);
          setProgress(0);
          await uploadScreenshot(ticket.uploadUrl, picture.file, setProgress);
          uploaded.current = { file: picture.file, key: ticket.storageKey };
        }
        shot = { screenshot_key: uploaded.current.key, screenshot_mime: picture.file.type, screenshot_width: picture.width, screenshot_height: picture.height };
      }
      const trade = editing && id ? await updateTrade(id, { ...values, ...shot }) : await createTrade({ ...values, ...shot });
      saved.current = true;
      try { if (values.pnl_currency) localStorage.setItem(CURRENCY_KEY, values.pnl_currency); } catch { /* not remembered */ }
      if (!editing) writeDraft(userId, null);
      // The picture this trade no longer shows (replaced or removed) goes; the server keeps any picture a trade still uses.
      if (original?.screenshot && original.screenshot.key !== shot.screenshot_key) void discardScreenshots([original.screenshot.key]);
      setJournalFlash(editing ? { kind: 'edited', id: trade.id } : { kind: 'saved', id: trade.id, tradeDate: trade.tradeDate });
      goBack();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the trade. Your entries are still here — try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
      setProgress(null);
    }
  }

  const suggestions = symbolFocus ? symbolSuggestions(draft.symbol, choices.symbols) : [];
  const strategyChoices = choices.strategies.filter(s => s !== draft.strategy.trim()).slice(0, 6);
  const showExisting = editing && original?.screenshot && keepExisting && !picture;
  const title = editing ? 'Edit Trade' : 'Add New Trade';

  return (
    <PhoneShell>
      <header style={css('flex:none;height:56px;display:flex;align-items:center;gap:8px;padding:0 16px 0 18px;border-bottom:1px solid var(--surface-divider)')}>
        <button type="button" onClick={leave} aria-label="Back" className="pressable icon-button"
          style={css('width:40px;height:40px;margin-left:-8px;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;cursor:pointer;color:var(--text-primary);border-radius:50%')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span aria-hidden="true" style={css('width:30px;height:30px;border-radius:9px;background:var(--accent-tint);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </span>
        <h1 style={css('margin:0;flex:1;min-width:0;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{title}</h1>
      </header>

      {loadState !== 'ready' ? (
        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center;font-size:13px;color:var(--text-muted)')}>
          {loadState === 'loading' ? 'Loading the trade…'
            : loadState === 'missing' ? 'This trade no longer exists.'
              : loadState === 'unavailable' ? 'The Trading Journal needs a database update before trades can be edited.'
                : 'Could not load the trade.'}
          {loadState !== 'loading' && <button type="button" onClick={goBack} style={css('font-weight:700;color:var(--accent-ink);cursor:pointer')}>Back to the journal</button>}
        </div>
      ) : (
        <>
          {/* Everything between the header and the Save button scrolls (never the clipped frame: the Create Post lesson). */}
          <div ref={formScroll} data-testid="trade-form"
            style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scroll-padding:12px 0 24px;padding:14px 16px 20px;display:flex;flex-direction:column;gap:12px')}>
            {restored && (
              <div role="status" style={css('flex:none;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--accent-tint);color:var(--accent-ink);font-size:12px')}>
                <span style={css('flex:1;min-width:0')}>We kept the trade you had started.</span>
                <button type="button" onClick={() => { const fresh = emptyDraft(lastCurrency()); setDraft(fresh); setBaseline(JSON.stringify(fresh)); writeDraft(userId, null); setRestored(false); setShowProblems(false); }}
                  style={css('flex:none;font-size:12px;font-weight:700;color:var(--accent-ink);cursor:pointer')}>Start over</button>
              </div>
            )}

            <section style={css('flex:none;border:1px solid var(--border-4);border-radius:16px;background:var(--surface);display:flex;flex-direction:column')} className="journal-form-card">
              <Row id="tradeDate" icon={ICONS.date} label="Date" problem={problems.tradeDate}>
                <input type="date" value={draft.tradeDate} max={today} min="2000-01-01" aria-label="Date" required
                  onChange={e => set('tradeDate', e.target.value)} style={input} />
              </Row>

              <Row id="symbol" icon={ICONS.symbol} label="Symbol Name" problem={problems.symbol}>
                <input value={draft.symbol} aria-label="Symbol name" placeholder="e.g. XAUUSD" maxLength={SYMBOL_MAX} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  onChange={e => set('symbol', e.target.value.toUpperCase())} onFocus={() => setSymbolFocus(true)} onBlur={() => window.setTimeout(() => setSymbolFocus(false), 150)}
                  style={{ ...input, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.02em' }} />
              </Row>
              {suggestions.length > 0 && (
                <div role="listbox" aria-label="Symbol suggestions" style={css('display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px')}>
                  {suggestions.map(s => (
                    <Chip key={s} label={`Use ${s}`} onClick={() => { set('symbol', s); setSymbolFocus(false); }}>{s}</Chip>
                  ))}
                </div>
              )}

              <Row id="direction" icon={ICONS.direction} label="Trade Direction" problem={problems.direction}>
                <div role="radiogroup" aria-label="Trade direction" style={css('display:flex;gap:8px')}>
                  <Choice on={draft.direction === 'buy'} tone="up" onClick={() => set('direction', 'buy')} label="Buy"><span aria-hidden="true">↑</span> BUY</Choice>
                  <Choice on={draft.direction === 'sell'} tone="down" onClick={() => set('direction', 'sell')} label="Sell"><span aria-hidden="true">↓</span> SELL</Choice>
                </div>
              </Row>

              <Row id="riskReward" icon={ICONS.rr} label="Risk : Reward (R:R)" problem={problems.riskReward}>
                <div style={css('display:flex;flex-direction:column;gap:7px')}>
                  <input value={draft.riskReward} aria-label="Risk to reward" placeholder="1:2" inputMode="decimal" autoComplete="off"
                    onChange={e => set('riskReward', e.target.value)} style={input} />
                  <div style={css('display:flex;gap:6px;flex-wrap:wrap')}>
                    {['1:1', '1:2', '1:3'].map(rr => <Chip key={rr} on={draft.riskReward.replace(/\s/g, '') === rr} onClick={() => set('riskReward', rr)}>{rr}</Chip>)}
                  </div>
                </div>
              </Row>

              <Row id="result" icon={ICONS.result} label="Result" problem={problems.result ?? problems.amount}>
                <div role="radiogroup" aria-label="Result" style={css('display:flex;gap:6px')}>
                  <Choice on={draft.result === 'profit'} tone="up" onClick={() => set('result', 'profit')}>Profit</Choice>
                  <Choice on={draft.result === 'loss'} tone="down" onClick={() => set('result', 'loss')}>Loss</Choice>
                  <Choice on={draft.result === 'breakeven'} tone="neutral" onClick={() => set('result', 'breakeven')}>Breakeven</Choice>
                </div>
              </Row>
              <div id="field-amount" style={css('padding:0 14px 13px;display:flex;flex-direction:column;gap:6px')}>
                <div style={css('display:flex;align-items:center;gap:8px')}>
                  <label style={css('position:relative;flex:none')}>
                    <span style={css('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)')}>Currency</span>
                    <select value={draft.currency} aria-label="Currency" onChange={e => set('currency', e.target.value as Currency)}
                      style={{ ...input, width: 96, paddingRight: 8, fontWeight: 600 }}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <div style={css('position:relative;flex:1;min-width:0')}>
                    <span aria-hidden="true" style={{ ...css('position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14.5px;font-weight:700;pointer-events:none'),
                      color: draft.result === 'loss' ? 'var(--danger-ink)' : draft.result === 'profit' ? 'var(--success-ink)' : 'var(--text-muted)' }}>
                      {draft.result === 'loss' ? '−' : draft.result === 'profit' ? '+' : ''}{currencySymbol(draft.currency).trim()}
                    </span>
                    <input aria-label="Profit or loss amount" inputMode="decimal" autoComplete="off" placeholder={draft.result === 'breakeven' ? '0' : 'Amount (optional)'}
                      disabled={draft.result === 'breakeven'} value={draft.result === 'breakeven' ? '0' : draft.amount} onChange={e => set('amount', e.target.value)}
                      style={{ ...input, paddingLeft: 20 + currencySymbol(draft.currency).trim().length * 9 + (draft.result && draft.result !== 'breakeven' ? 9 : 0) }} />
                  </div>
                </div>
                <div style={css('font-size:11px;color:var(--text-faint);line-height:1.4')}>
                  {draft.result === 'breakeven' ? 'A breakeven trade is recorded as 0.' : 'P&L in money, used for Net P&L. Profit is added, loss is subtracted.'}
                </div>
              </div>

              <Row id="strategy" icon={ICONS.strategy} label="Strategy Used" problem={problems.strategy}>
                <input value={draft.strategy} aria-label="Strategy used" placeholder="e.g. EMA Crossover" maxLength={STRATEGY_MAX} autoComplete="off"
                  onChange={e => set('strategy', e.target.value)} style={input} />
              </Row>
              {strategyChoices.length > 0 && (
                <div style={css('display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 12px')}>
                  {strategyChoices.map(s => <Chip key={s} label={`Use strategy ${s}`} onClick={() => set('strategy', s)}>{s}</Chip>)}
                </div>
              )}
            </section>

            <section style={css('flex:none;border:1px solid var(--border-4);border-radius:16px;background:var(--surface)')}>
              <Row id="notes" icon={ICONS.mistakes} label="Mistakes (If Any)" problem={problems.notes} stacked>
                <div style={css('display:flex;flex-direction:column;gap:10px')}>
                  <div style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                    <Chip on={draft.followedPlan} onClick={() => setDraft(d => ({ ...d, followedPlan: !d.followedPlan, mistakes: !d.followedPlan ? [] : d.mistakes }))}>
                      ✓ No mistakes — followed my plan
                    </Chip>
                    {MISTAKES.map(([tag, label]) => {
                      const on = draft.mistakes.includes(tag);
                      return (
                        <Chip key={tag} on={on} onClick={() => setDraft(d => ({ ...d, followedPlan: false,
                          mistakes: on ? d.mistakes.filter(m => m !== tag) : [...d.mistakes, tag as MistakeTag] }))}>{label}</Chip>
                      );
                    })}
                  </div>
                  <textarea value={draft.notes} aria-label="Mistakes, notes and lessons" maxLength={NOTES_MAX} rows={4}
                    placeholder="What happened? e.g. Entered a bit early before confirmation. Wait for the candle close next time."
                    onChange={e => set('notes', e.target.value)}
                    style={css('width:100%;min-height:96px;resize:vertical;border-radius:11px;border:1px solid var(--border-4);background:var(--surface-secondary);padding:10px 12px;font-size:14px;line-height:1.5;color:var(--text-primary)')} />
                  <div style={css('align-self:flex-end;font-size:10.5px;color:var(--text-faint);font-variant-numeric:tabular-nums')}>{draft.notes.length}/{NOTES_MAX}</div>
                </div>
              </Row>
            </section>

            <section style={css('flex:none;border:1px solid var(--border-4);border-radius:16px;background:var(--surface)')}>
              <Row id="screenshot" icon={ICONS.picture} label="Screenshot (Chart)" problem={pictureProblem ?? undefined} stacked>
                <input ref={pictureInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e => void pickPicture(e)}
                  style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
                {picture || showExisting ? (
                  <div style={css('display:flex;flex-direction:column;gap:9px')}>
                    {picture ? (
                      <div style={css('position:relative;border-radius:13px;overflow:hidden;background:var(--surface-sunken-2);border:1px solid var(--border-4)')}>
                        <img src={picture.previewUrl} alt="Chart screenshot preview" data-testid="screenshot-preview"
                          style={css('display:block;width:100%;max-height:min(260px, 36vh);object-fit:contain')} />
                        {progress !== null && (
                          <div role="status" style={css('position:absolute;inset:0;background:rgba(var(--shadow-rgb),.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--on-accent)')}>
                            Uploading {Math.round(progress * 100)}%
                          </div>
                        )}
                      </div>
                    ) : original ? <JournalScreenshot trade={original} /> : null}
                    <div style={css('display:flex;gap:8px')}>
                      <button type="button" disabled={busy} onClick={() => pictureInput.current?.click()} className="pressable"
                        style={css('flex:1;height:38px;border-radius:10px;border:1px solid var(--accent-border);background:var(--surface);font-size:12.5px;font-weight:700;color:var(--accent-ink);cursor:pointer;white-space:nowrap')}>Replace image</button>
                      <button type="button" disabled={busy} onClick={removePicture} className="pressable"
                        style={css('flex:1;height:38px;border-radius:10px;border:1px solid var(--danger-border);background:var(--surface);font-size:12.5px;font-weight:700;color:var(--danger-ink);cursor:pointer;white-space:nowrap')}>Remove image</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => pictureInput.current?.click()} aria-label="Upload a chart screenshot" className="pressable"
                    style={css('width:100%;min-height:96px;border-radius:13px;border:1.5px dashed var(--accent-border);background:var(--surface-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;color:var(--accent-ink)')}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5h.5a3.75 3.75 0 0 1 0 7.5H17M12 12v8M9 15l3-3 3 3" /></svg>
                    <span style={css('font-size:13px;font-weight:700')}>Upload Image</span>
                    <span style={css('font-size:10.5px;color:var(--text-faint)')}>JPEG, PNG or WebP · up to 10 MB</span>
                  </button>
                )}
              </Row>
            </section>
          </div>

          <footer style={css('flex:none;padding:10px 16px calc(12px + env(safe-area-inset-bottom, 0px));border-top:1px solid var(--surface-divider);background:var(--surface);display:flex;flex-direction:column;gap:8px')}>
            {saveError && (
              <div role="alert" style={css('display:flex;align-items:center;gap:10px;font-size:12px;color:var(--danger-ink);line-height:1.4')}>
                <span style={css('flex:1;min-width:0')}>{saveError}</span>
                <button type="button" onClick={() => void save()} style={css('flex:none;font-size:12px;font-weight:700;color:var(--accent-ink);cursor:pointer')}>Retry</button>
              </div>
            )}
            <button type="button" onClick={() => void save()} disabled={busy} aria-busy={busy} className="pressable" data-testid="save-trade"
              style={{ ...css('height:50px;border:0;border-radius:14px;background:var(--accent);color:var(--on-accent);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px'),
                opacity: busy ? 0.7 : 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.3 12.3l2.6 2.6 4.8-5" /></svg>
              {busy ? (progress !== null && progress < 1 ? `Uploading ${Math.round(progress * 100)}%…` : 'Saving…') : editing ? 'Save Changes' : 'Save Trade'}
            </button>
          </footer>
        </>
      )}

      {confirmLeave && (
        <ConfirmDialog title={editing ? 'Discard your changes?' : 'Discard this trade?'}
          body={editing ? 'Your changes to this trade will not be saved.' : 'What you entered and any picture you chose will be lost.'}
          confirmLabel="Discard" cancelLabel="Keep editing" danger onConfirm={discardAndLeave} onCancel={() => setConfirmLeave(false)} />
      )}
    </PhoneShell>
  );
}
