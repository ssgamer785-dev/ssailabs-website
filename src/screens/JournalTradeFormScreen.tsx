import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { PhoneShell } from '../components/PhoneShell';
import { ImageViewer } from '../components/media/ImageViewer';
import { ConfirmDialog, JournalScreenshot, ScreenshotFrame } from '../components/journal/JournalParts';
import { Field, FormSection, Segmented, SymbolField, glyph, type SegOption } from '../components/journal/FormParts';
import {
  JournalUnavailableError, UploadCancelledError, createTrade, discardScreenshots, getTrade, recentChoices, requestScreenshotUpload, updateTrade,
  uploadScreenshot, type ScreenshotFields,
} from '../lib/journal/api';
import { setJournalFlash } from '../lib/journal/flash';
import {
  CURRENCIES, MISTAKES, NOTES_MAX, STRATEGY_MAX, SCREENSHOT_TYPES, currencySymbol, draftFromTrade, emptyDraft, formatMoney, localDateString, parseAmount,
  parseRiskReward, screenshotProblem, validateDraft, type Currency, type DraftField, type DraftProblems, type Direction, type JournalTrade,
  type MistakeTag, type TradeDraft, type TradeResult,
} from '../lib/journal/model';
import { ScreenshotTooLargeError, fitScreenshot } from '../lib/journal/screenshot';
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

/** A picture chosen in this form, and how far its upload has got. */
interface Picture {
  id: number; file: File; previewUrl: string; width: number | null; height: number | null; optimised: boolean;
  status: 'uploading' | 'uploaded' | 'failed'; progress: number; key: string | null; error: string | null;
}
type UploadOutcome = { key: string } | { error: string } | null;

const RR_PRESETS = [1, 2, 3];
const DIRECTIONS: SegOption<Direction>[] = [
  { value: 'buy', label: 'Buy', tone: 'up', icon: glyph('M12 19V5M6 11l6-6 6 6') },
  { value: 'sell', label: 'Sell', tone: 'down', icon: glyph('M12 5v14M6 13l6 6 6-6') },
];
const RESULTS: SegOption<TradeResult>[] = [
  { value: 'profit', label: 'Profit', tone: 'up', icon: glyph('M5 15l5-5 4 4 5-6') },
  { value: 'loss', label: 'Loss', tone: 'down', icon: glyph('M5 9l5 5 4-4 5 6') },
  { value: 'breakeven', label: 'Breakeven', tone: 'neutral', icon: glyph('M5 10h14M5 14h14') },
];
const ACCEPT = [...SCREENSHOT_TYPES, 'image/heic', 'image/heif'].join(',');
const signOf = (result: TradeResult | null) => (result === 'profit' ? '+' : result === 'loss' ? '−' : '');

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
  const [rrCustom, setRrCustom] = useState(() => { const v = parseRiskReward((restoredDraft ?? emptyDraft()).riskReward); return v !== null && !RR_PRESETS.includes(v); });

  const [picture, setPicture] = useState<Picture | null>(null);
  const [keepExisting, setKeepExisting] = useState(true);
  const [pictureProblem, setPictureProblem] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const pictureInput = useRef<HTMLInputElement>(null);
  const job = useRef<{ id: number; controller: AbortController; promise: Promise<UploadOutcome> } | null>(null);
  /** A key uploaded for the current picture that no saved trade uses yet: removed if the picture or the form is abandoned. */
  const pendingKey = useRef<string | null>(null);
  const pictureSeq = useRef(0);
  const pictureUrl = useRef<string | null>(null);

  const [busy, setBusy] = useState<false | 'uploading' | 'saving'>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const submitting = useRef(false);
  const saved = useRef(false);
  const formScroll = useRef<HTMLDivElement>(null);
  const rrInput = useRef<HTMLInputElement>(null);
  const today = localDateString();

  // Editing: the trade as saved.
  useEffect(() => {
    if (!id) return;
    let live = true;
    getTrade(id).then(trade => {
      if (!live) return;
      if (!trade) { setLoadState('missing'); return; }
      const next = draftFromTrade(trade, lastCurrency());
      const rr = parseRiskReward(next.riskReward);
      setOriginal(trade);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setRrCustom(rr !== null && !RR_PRESETS.includes(rr));
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

  // Leaving without saving: an upload in flight stops, a picture no trade uses is removed, the preview is freed.
  useEffect(() => () => {
    job.current?.controller.abort();
    if (pendingKey.current && !saved.current) void discardScreenshots([pendingKey.current]);
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
      const hidden = field.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height) + 24;
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

  // ---- The picture: checked, optimised if over the limit, previewed, and uploaded straight away ----------------------

  const patchPicture = (pictureId: number, patch: Partial<Picture>) => setPicture(p => (p && p.id === pictureId ? { ...p, ...patch } : p));

  const startUpload = useCallback((pic: Picture) => {
    job.current?.controller.abort();
    const controller = new AbortController();
    let ticketKey: string | null = null;
    patchPicture(pic.id, { status: 'uploading', progress: 0, error: null, key: null });
    const promise = (async (): Promise<UploadOutcome> => {
      try {
        const ticket = await requestScreenshotUpload(pic.file, controller.signal);
        ticketKey = ticket.storageKey;
        await uploadScreenshot(ticket.uploadUrl, pic.file, fraction => patchPicture(pic.id, { progress: fraction }), controller.signal);
        if (controller.signal.aborted) throw new UploadCancelledError();
        pendingKey.current = ticket.storageKey;
        patchPicture(pic.id, { status: 'uploaded', progress: 1, key: ticket.storageKey });
        return { key: ticket.storageKey };
      } catch (error) {
        if (error instanceof UploadCancelledError || controller.signal.aborted) {
          if (ticketKey) void discardScreenshots([ticketKey]);
          return null;
        }
        const message = error instanceof Error ? error.message : 'The picture did not upload. Tap Retry.';
        patchPicture(pic.id, { status: 'failed', error: message });
        return { error: message };
      }
    })();
    job.current = { id: pic.id, controller, promise };
  }, []);

  /** Drops the current picture's upload: stops it if it is still going, removes it if it arrived and nothing uses it. */
  const dropUpload = () => {
    job.current?.controller.abort();
    job.current = null;
    if (pendingKey.current && !saved.current) void discardScreenshots([pendingKey.current]);
    pendingKey.current = null;
  };

  async function pickPicture(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    event.target.value = '';
    if (!raw) return;
    setPictureProblem(null);
    setPreparing(true);
    try {
      let file = normalizePickedFile(raw);
      const typeProblem = screenshotProblem({ type: file.type, size: 0 });
      if (typeProblem && !/^image\/hei[cf]/i.test(file.type) && !/\.hei[cf]$/i.test(file.name)) { setPictureProblem(typeProblem); return; }
      file = await toPortableImage(file);
      const fitted = await fitScreenshot(file);
      file = fitted.file;
      const problem = screenshotProblem(file);
      if (problem) { setPictureProblem(problem); return; }
      const size = await measureImage(file);
      dropUpload();
      if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current);
      const previewUrl = URL.createObjectURL(file);
      pictureUrl.current = previewUrl;
      const next: Picture = { id: ++pictureSeq.current, file, previewUrl, width: size?.width ?? null, height: size?.height ?? null,
        optimised: fitted.optimised, status: 'uploading', progress: 0, key: null, error: null };
      setPreviewLoaded(false);
      setPicture(next);
      setSaveError(null);
      startUpload(next);
    } catch (error) {
      if (error instanceof PortableImageError || error instanceof ScreenshotTooLargeError) setPictureProblem(error.message);
      else setPictureProblem('That picture could not be read. Try another one.');
    } finally {
      setPreparing(false);
    }
  }

  function removePicture() {
    if (picture) {
      dropUpload();
      if (pictureUrl.current) { URL.revokeObjectURL(pictureUrl.current); pictureUrl.current = null; }
      setPicture(null);
    } else {
      setKeepExisting(false);
    }
    setPictureProblem(null);
  }

  // ---- Saving ----------------------------------------------------------------------------------------------------------

  async function save() {
    if (submitting.current) return;
    setShowProblems(true);
    const { problems: found, values } = validateDraft(draft);
    if (!values) {
      const first = (['tradeDate', 'symbol', 'direction', 'riskReward', 'result', 'amount', 'strategy', 'notes'] as DraftField[]).find(f => found[f]);
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    submitting.current = true;
    setSaveError(null);
    try {
      const existing = editing && original?.screenshot && keepExisting ? original.screenshot : null;
      let shot: ScreenshotFields = existing
        ? { screenshot_key: existing.key, screenshot_mime: existing.mime, screenshot_width: existing.width, screenshot_height: existing.height }
        : { screenshot_key: null, screenshot_mime: null, screenshot_width: null, screenshot_height: null };
      if (picture) {
        let key = picture.key;
        if (!key) {
          // Still on its way, or it failed earlier: wait for it, or try once more now.
          if (picture.status === 'failed' || job.current?.id !== picture.id) startUpload(picture);
          setBusy('uploading');
          const outcome = await job.current!.promise;
          if (!outcome || 'error' in outcome) {
            setSaveError(outcome && 'error' in outcome ? outcome.error : 'The picture did not upload. Tap Retry.');
            return;
          }
          key = outcome.key;
        }
        shot = { screenshot_key: key, screenshot_mime: picture.file.type, screenshot_width: picture.width, screenshot_height: picture.height };
      }
      setBusy('saving');
      const trade = editing && id ? await updateTrade(id, { ...values, ...shot }) : await createTrade({ ...values, ...shot });
      saved.current = true;
      pendingKey.current = null;
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
    }
  }

  // ---- Derived for display -------------------------------------------------------------------------------------------

  const rrValue = parseRiskReward(draft.riskReward);
  const rrPreset = !rrCustom && rrValue !== null && RR_PRESETS.includes(rrValue) ? rrValue : null;
  const rrCustomText = (() => { const m = /^\s*1\s*:\s*(.*)$/.exec(draft.riskReward); return m ? m[1] : draft.riskReward; })();
  const typedAmount = parseAmount(draft.amount);
  const recordedAs = draft.result === 'breakeven' ? formatMoney(0, draft.currency)
    : draft.result && typedAmount !== null && !Number.isNaN(typedAmount) && typedAmount > 0 ? formatMoney(draft.result === 'loss' ? -typedAmount : typedAmount, draft.currency)
      : null;
  const toneColor = draft.result === 'profit' ? 'var(--success-ink)' : draft.result === 'loss' ? 'var(--danger-ink)' : 'var(--text-muted)';
  const strategyChoices = choices.strategies.filter(s => s !== draft.strategy.trim()).slice(0, 6);
  const showExisting = editing && original?.screenshot && keepExisting && !picture;
  const title = editing ? 'Edit Trade' : 'Add New Trade';
  const uploadingNow = picture?.status === 'uploading';
  const saveLabel = busy === 'uploading' ? `Uploading picture${picture ? ` ${Math.round(picture.progress * 100)}%` : ''}…`
    : busy === 'saving' ? 'Saving…' : editing ? 'Save Changes' : 'Save Trade';

  return (
    <PhoneShell>
      <header style={css('flex:none;height:56px;display:flex;align-items:center;gap:6px;padding:0 16px 0 10px;border-bottom:1px solid var(--surface-divider);background:var(--surface)')}>
        <button type="button" onClick={leave} aria-label="Back" className="pressable icon-button"
          style={css('width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;cursor:pointer;color:var(--text-primary);border-radius:50%')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1 style={css('margin:0;flex:1;min-width:0;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{title}</h1>
      </header>

      {loadState !== 'ready' ? (
        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center;font-size:13px;color:var(--text-muted)')}>
          {loadState === 'loading' ? <><span className="jr-spinner" style={css('color:var(--accent)')} />Loading the trade…</>
            : loadState === 'missing' ? 'This trade no longer exists.'
              : loadState === 'unavailable' ? 'The Trading Journal needs a database update before trades can be edited.'
                : 'Could not load the trade.'}
          {loadState !== 'loading' && <button type="button" onClick={goBack} className="jr-chip pressable">Back to the journal</button>}
        </div>
      ) : (
        <>
          {/* Everything between the header and the Save button scrolls, in one container (no nested scrolling). */}
          <div ref={formScroll} data-testid="trade-form"
            style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scroll-padding:16px 0 32px;padding:16px 16px 28px;display:flex;flex-direction:column;gap:14px;background:var(--app-bg)')}>
            {restored && (
              <div role="status" style={css('flex:none;display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:14px;background:var(--accent-soft);color:var(--accent-ink);font-size:12.5px')}>
                <span style={css('flex:1;min-width:0')}>We kept the trade you had started.</span>
                <button type="button" onClick={() => { const fresh = emptyDraft(lastCurrency()); setDraft(fresh); setBaseline(JSON.stringify(fresh)); writeDraft(userId, null); setRestored(false); setShowProblems(false); setRrCustom(false); }}
                  style={css('flex:none;font-size:12.5px;font-weight:700;color:var(--accent-ink);cursor:pointer;background:none;border:0')}>Start over</button>
              </div>
            )}

            <FormSection title="Trade" testId="section-trade">
              <Field id="tradeDate" label="Date" labelFor="journal-date" problem={problems.tradeDate}>
                <input id="journal-date" type="date" value={draft.tradeDate} max={today} min="2000-01-01" aria-label="Date" required
                  aria-invalid={!!problems.tradeDate || undefined} onChange={e => set('tradeDate', e.target.value)} className="jr-control" />
              </Field>

              <Field id="symbol" label="Symbol" problem={problems.symbol} hint="The same instruments as the Risk Calculator.">
                <SymbolField value={draft.symbol} recent={choices.symbols} invalid={!!problems.symbol} onChange={symbol => set('symbol', symbol)} />
              </Field>

              <Field id="direction" label="Direction" problem={problems.direction}>
                <Segmented labelledBy="label-direction" options={DIRECTIONS} value={draft.direction} onChange={v => set('direction', v)} invalid={!!problems.direction} testId="direction-choice" />
              </Field>

              <Field id="riskReward" label="Risk : Reward" problem={problems.riskReward}>
                <div role="radiogroup" aria-labelledby="label-riskReward" className="jr-seg" style={{ ['--jr-n' as string]: 4 }}>
                  {RR_PRESETS.map(n => (
                    <button key={n} type="button" role="radio" aria-checked={rrPreset === n} className="jr-seg-btn pressable"
                      onClick={() => { setRrCustom(false); set('riskReward', `1:${n}`); }}><span>1:{n}</span></button>
                  ))}
                  <button type="button" role="radio" aria-checked={rrCustom} className="jr-seg-btn pressable"
                    onClick={() => { setRrCustom(true); set('riskReward', rrPreset === null ? draft.riskReward : ''); window.setTimeout(() => rrInput.current?.focus(), 0); }}><span>Custom</span></button>
                </div>
                {rrCustom && (
                  <div className={`jr-control${problems.riskReward ? ' is-invalid' : ''}`} style={css('display:flex;align-items:center;gap:8px')}>
                    <span aria-hidden="true" style={css('flex:none;font-weight:700;color:var(--text-muted)')}>1 :</span>
                    <input ref={rrInput} value={rrCustomText} aria-label="Risk to reward" placeholder="2.5" inputMode="decimal" autoComplete="off" enterKeyHint="next"
                      onChange={e => { const v = e.target.value.replace(/[^\d.,]/g, ''); set('riskReward', v ? `1:${v}` : ''); }} />
                  </div>
                )}
              </Field>
            </FormSection>

            <FormSection title="Outcome" testId="section-outcome">
              <Field id="result" label="Result" problem={problems.result}>
                <Segmented labelledBy="label-result" options={RESULTS} value={draft.result} tiles invalid={!!problems.result} testId="result-choice"
                  onChange={v => setDraft(d => ({ ...d, result: v, amount: v === 'breakeven' ? '' : d.amount }))} />
              </Field>

              <Field id="amount" label="Profit / loss amount" optional={draft.result !== 'breakeven'} problem={problems.amount}
                hint={draft.result === 'breakeven' ? 'A breakeven trade is recorded as 0.'
                  : recordedAs ? <>Recorded as <strong style={{ color: toneColor }}>{recordedAs}</strong> — the sign follows the result.</>
                    : draft.result ? 'Enter the amount without a sign — the result sets it.' : 'Choose the result first; it sets the sign.'}>
                <div style={css('display:flex;gap:8px;min-width:0')}>
                  <label className="jr-control" style={css('flex:none;width:108px;display:flex;align-items:center;gap:4px;padding:0 10px 0 12px;position:relative')}>
                    <span style={css('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)')}>Currency</span>
                    <select value={draft.currency} aria-label="Currency" onChange={e => set('currency', e.target.value as Currency)}
                      style={css('appearance:none;-webkit-appearance:none;font-weight:700;cursor:pointer;padding-right:16px')}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true" style={css('position:absolute;right:10px;pointer-events:none')}><path d="M6 9l6 6 6-6" /></svg>
                  </label>
                  <div className={`jr-control${draft.result === 'breakeven' ? ' is-disabled' : ''}${problems.amount ? ' is-invalid' : ''}`} style={css('flex:1;display:flex;align-items:center;gap:6px')}>
                    <span aria-hidden="true" data-testid="amount-sign" style={{ ...css('flex:none;font-weight:700;font-variant-numeric:tabular-nums'), color: toneColor }}>
                      {draft.result === 'breakeven' ? '' : signOf(draft.result)}{currencySymbol(draft.currency).trim()}
                    </span>
                    <input aria-label="Profit or loss amount" inputMode="decimal" autoComplete="off" enterKeyHint="next"
                      placeholder={draft.result === 'breakeven' ? '0' : '0.00'} disabled={draft.result === 'breakeven'}
                      value={draft.result === 'breakeven' ? '0' : draft.amount}
                      onChange={e => set('amount', e.target.value.replace(/^[\s+\-−]+/, '').replace(/[^\d.,]/g, ''))}
                      style={css('font-variant-numeric:tabular-nums;font-weight:600')} />
                  </div>
                </div>
              </Field>

              <Field id="strategy" label="Strategy" labelFor="journal-strategy" optional problem={problems.strategy}>
                <input id="journal-strategy" value={draft.strategy} aria-label="Strategy used" placeholder="e.g. EMA crossover" maxLength={STRATEGY_MAX} autoComplete="off" enterKeyHint="next"
                  onChange={e => set('strategy', e.target.value)} className="jr-control" />
                {strategyChoices.length > 0 && (
                  <div style={css('display:flex;flex-wrap:wrap;gap:7px')}>
                    {strategyChoices.map(s => <button key={s} type="button" className="jr-chip pressable" aria-label={`Use strategy ${s}`} onClick={() => set('strategy', s)}>{s}</button>)}
                  </div>
                )}
              </Field>
            </FormSection>

            <FormSection title="Review" caption="What went well, what didn't — your future self will thank you." testId="section-review">
              <Field id="mistakes" label="Mistakes" optional>
                <div style={css('display:flex;flex-wrap:wrap;gap:7px')}>
                  <button type="button" className="jr-chip pressable" data-tone="good" aria-pressed={draft.followedPlan}
                    onClick={() => setDraft(d => ({ ...d, followedPlan: !d.followedPlan, mistakes: !d.followedPlan ? [] : d.mistakes }))}>
                    ✓ No mistakes — followed my plan
                  </button>
                  {MISTAKES.map(([tag, label]) => {
                    const on = draft.mistakes.includes(tag);
                    return (
                      <button key={tag} type="button" className="jr-chip pressable" data-tone="warn" aria-pressed={on}
                        onClick={() => setDraft(d => ({ ...d, followedPlan: false, mistakes: on ? d.mistakes.filter(m => m !== tag) : [...d.mistakes, tag as MistakeTag] }))}>{label}</button>
                    );
                  })}
                </div>
              </Field>
              <Field id="notes" label="Notes & lessons" labelFor="journal-notes" optional problem={problems.notes}>
                <textarea id="journal-notes" value={draft.notes} aria-label="Mistakes, notes and lessons" maxLength={NOTES_MAX} rows={4} className="jr-control"
                  placeholder="What happened? e.g. Entered before the candle closed — wait for confirmation next time."
                  onChange={e => set('notes', e.target.value)} />
                <div style={css('align-self:flex-end;margin-top:-2px;font-size:11px;color:var(--text-faint);font-variant-numeric:tabular-nums')}>{draft.notes.length}/{NOTES_MAX}</div>
              </Field>
            </FormSection>

            <FormSection title="Chart screenshot" caption="Optional. Shown in full on the trade's page — never cropped." testId="section-screenshot">
              <div id="field-screenshot" style={css('display:flex;flex-direction:column;gap:10px;min-width:0')}>
                <input ref={pictureInput} type="file" accept={ACCEPT} onChange={e => void pickPicture(e)} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} data-testid="screenshot-input" />
                {picture ? (
                  <>
                    <ScreenshotFrame src={picture.previewUrl} alt="Chart screenshot preview" width={picture.width} height={picture.height} loaded={previewLoaded}
                      testId="screenshot-preview" onLoad={() => setPreviewLoaded(true)} onOpen={() => setViewing(true)} />
                    <div data-testid="upload-status" data-status={picture.status} aria-live="polite"
                      style={css('display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:12px;background:var(--surface-secondary)')}>
                      {picture.status === 'uploading' && (
                        <>
                          <div style={css('display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--text-secondary)')}>
                            <span className="jr-spinner" style={css('color:var(--accent);width:14px;height:14px')} />
                            <span style={css('flex:1')}>Uploading…</span>
                            <span style={css('font-variant-numeric:tabular-nums;color:var(--text-muted)')}>{Math.round(picture.progress * 100)}%</span>
                          </div>
                          <div className="jr-progress" role="progressbar" aria-label="Picture upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(picture.progress * 100)}>
                            <i style={{ width: `${Math.max(4, Math.round(picture.progress * 100))}%` }} />
                          </div>
                        </>
                      )}
                      {picture.status === 'uploaded' && (
                        <div style={css('display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--success-ink)')}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.3 12.3l2.6 2.6 4.8-5" /></svg>
                          <span style={css('flex:1;min-width:0')}>Uploaded{picture.width && picture.height ? ` · ${picture.width} × ${picture.height}` : ''}{picture.optimised ? ' · optimised to fit 10 MB' : ''}</span>
                        </div>
                      )}
                      {picture.status === 'failed' && (
                        <div role="alert" style={css('display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--danger-ink);line-height:1.4')}>
                          <span style={css('flex:1;min-width:0')}>{picture.error}</span>
                          <button type="button" onClick={() => startUpload(picture)} className="jr-chip pressable" style={css('flex:none')}>Retry</button>
                        </div>
                      )}
                    </div>
                  </>
                ) : showExisting && original ? <JournalScreenshot trade={original} /> : (
                  <button type="button" onClick={() => pictureInput.current?.click()} aria-label="Upload a chart screenshot" disabled={preparing} className="jr-tap"
                    style={css('width:100%;min-height:132px;border-radius:14px;border:1.5px dashed var(--accent-border-2);background:var(--accent-tint-2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer;color:var(--accent-ink);padding:16px')}>
                    {preparing ? <span className="jr-spinner" style={css('width:22px;height:22px')} /> : (
                      <span aria-hidden="true" style={css('width:44px;height:44px;border-radius:13px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center')}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5M12 15V4M7.5 8.5 12 4l4.5 4.5" /></svg>
                      </span>
                    )}
                    <span style={css('font-size:13.5px;font-weight:700')}>{preparing ? 'Preparing picture…' : 'Upload a chart screenshot'}</span>
                    <span style={css('font-size:11.5px;color:var(--text-muted)')}>JPEG, PNG or WebP · up to 10 MB</span>
                  </button>
                )}
                {(picture || showExisting) && (
                  <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
                    <button type="button" disabled={!!busy || preparing} onClick={() => pictureInput.current?.click()} className="jr-seg-btn pressable" style={css('min-height:42px;font-size:13px')}>
                      {preparing ? <span className="jr-spinner" style={css('width:14px;height:14px')} /> : glyph('M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3', 2)}<span>Replace image</span>
                    </button>
                    <button type="button" disabled={!!busy} onClick={removePicture} className="jr-seg-btn pressable" style={css('min-height:42px;font-size:13px;color:var(--danger-ink)')}>
                      {glyph('M5 7h14M10 11v6M14 11v6M6.5 7l1 12h9l1-12M9.5 7V4.5h5V7', 2)}<span>Remove image</span>
                    </button>
                  </div>
                )}
                {pictureProblem && <div role="alert" className="jr-problem"><span>{pictureProblem}</span></div>}
              </div>
            </FormSection>
          </div>

          <footer style={css('flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));border-top:1px solid var(--surface-divider);background:var(--surface);display:flex;flex-direction:column;gap:10px')}>
            {saveError && (
              <div role="alert" style={css('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--danger-soft);font-size:12.5px;color:var(--danger-ink);line-height:1.4')}>
                <span style={css('flex:1;min-width:0')}>{saveError}</span>
                <button type="button" onClick={() => void save()} className="jr-chip pressable" style={css('flex:none')}>Retry</button>
              </div>
            )}
            <button type="button" onClick={() => void save()} disabled={!!busy} aria-busy={!!busy} className="pressable" data-testid="save-trade"
              style={{ ...css('height:52px;border:0;border-radius:14px;background:linear-gradient(180deg,var(--accent-grad-a),var(--accent-grad-b));color:var(--on-accent);font-size:15.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 8px 20px rgba(11,95,239,.22)'),
                opacity: busy ? 0.85 : 1 }}>
              {busy ? <span className="jr-spinner" /> : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              )}
              {saveLabel}
            </button>
            {uploadingNow && !busy && <div style={css('margin-top:-4px;text-align:center;font-size:11px;color:var(--text-faint)')}>You can save now — the picture finishes uploading first.</div>}
          </footer>
        </>
      )}

      {viewing && picture && (
        <ImageViewer storageKey={`local-${picture.id}`} fileName="chart-screenshot" getUrl={async () => picture.previewUrl} onClose={() => setViewing(false)} />
      )}
      {confirmLeave && (
        <ConfirmDialog title={editing ? 'Discard your changes?' : 'Discard this trade?'}
          body={editing ? 'Your changes to this trade will not be saved.' : 'What you entered and any picture you chose will be lost.'}
          confirmLabel="Discard" cancelLabel="Keep editing" danger onConfirm={discardAndLeave} onCancel={() => setConfirmLeave(false)} />
      )}
    </PhoneShell>
  );
}
