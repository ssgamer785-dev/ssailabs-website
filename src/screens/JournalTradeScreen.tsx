import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { css } from '../lib/css';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { ConfirmDialog, DirectionBadge, JournalScreenshot, JournalToast, resultColor } from '../components/journal/JournalParts';
import { JournalUnavailableError, deleteTrade, getTrade } from '../lib/journal/api';
import { setJournalFlash, takeJournalFlash } from '../lib/journal/flash';
import { formatMoney, formatRiskReward, longDate, mistakeLabel, resultLabel, type JournalTrade } from '../lib/journal/model';
import { isListedSymbol, symbolLabel } from '../lib/journal/symbols';

function stamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** One labelled fact on the trade page. */
function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={css('display:flex;flex-direction:column;gap:5px;min-width:0;padding:12px 13px;border-radius:13px;background:var(--surface-secondary)')}>
      <div style={css('font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.01em')}>{label}</div>
      <div style={css('font-size:14px;font-weight:700;color:var(--text-primary);min-width:0;overflow-wrap:anywhere')}>{children}</div>
    </div>
  );
}

const notRecorded = <span style={css('color:var(--text-faint);font-weight:600')}>Not recorded</span>;

/** One trade, in full: everything recorded, and its chart screenshot whole. */
export function JournalTradeScreen() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [trade, setTrade] = useState<JournalTrade | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error' | 'unavailable'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { if (takeJournalFlash('edited')) setNotice('Changes saved'); }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(t);
  }, [notice]);

  const load = useCallback(async () => {
    try {
      const next = await getTrade(id);
      setTrade(next);
      setState(next ? 'ready' : 'missing');
    } catch (error) {
      setState(error instanceof JournalUnavailableError ? 'unavailable' : 'error');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useRefreshHandler(load);

  const backToJournal = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/journal', { replace: true });
  };

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTrade(id);
      setJournalFlash({ kind: 'deleted' });
      setConfirming(false);
      backToJournal();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the trade. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  const money = trade && trade.pnlAmount !== null && trade.pnlCurrency ? formatMoney(trade.pnlAmount, trade.pnlCurrency) : null;
  const tone = trade ? resultColor(trade.result) : 'var(--text-primary)';
  const tint = trade?.result === 'profit' ? 'var(--success-soft)' : trade?.result === 'loss' ? 'var(--danger-soft)' : 'var(--surface-secondary)';

  return (
    <PhoneShell>
      <header style={css('flex:none;height:56px;display:flex;align-items:center;gap:8px;padding:0 14px 0 10px;border-bottom:1px solid var(--surface-divider);background:var(--surface)')}>
        <AppBackButton fallback="/journal" />
        <h1 style={css('margin:0;flex:1;min-width:0;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Trade Details</h1>
        {state === 'ready' && (
          <button type="button" onClick={() => navigate(`/journal/trade/${id}/edit`)} className="pressable"
            style={css('flex:none;height:38px;padding:0 14px;border-radius:11px;border:1px solid var(--accent-border-2);background:var(--accent-tint-2);font-size:13px;font-weight:700;color:var(--accent-ink);cursor:pointer;display:flex;align-items:center;gap:6px')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
            Edit Trade
          </button>
        )}
      </header>

      {state !== 'ready' || !trade ? (
        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center;font-size:13px;color:var(--text-muted)')}>
          {state === 'loading' ? <><span className="jr-spinner" style={css('color:var(--accent)')} />Loading the trade…</>
            : state === 'missing' ? 'This trade is no longer available.'
              : state === 'unavailable' ? 'The Trading Journal needs a database update. Please check back soon.'
                : 'Could not load the trade.'}
          {state === 'error' && <button type="button" onClick={() => void load()} className="jr-chip pressable">Try again</button>}
          {(state === 'missing' || state === 'unavailable') && <button type="button" onClick={backToJournal} className="jr-chip pressable">Back to the journal</button>}
        </div>
      ) : (
        <div data-testid="trade-detail" style={css('flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 16px calc(28px + env(safe-area-inset-bottom, 0px));display:flex;flex-direction:column;gap:14px;background:var(--app-bg)')}>
          {/* ---- At a glance ---- */}
          <section className="jr-card" style={css('padding:18px 16px 16px;display:flex;flex-direction:column;gap:14px')}>
            <div style={css('display:flex;align-items:flex-start;gap:12px')}>
              <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
                <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
                  <span data-testid="detail-symbol" style={css('font-size:23px;font-weight:700;letter-spacing:-.6px;overflow-wrap:anywhere')}>{symbolLabel(trade.symbol)}</span>
                  <DirectionBadge direction={trade.direction} size="large" />
                </div>
                <div style={css('font-size:12.5px;color:var(--text-muted)')}>{longDate(trade.tradeDate)}{isListedSymbol(trade.symbol) ? '' : ' · symbol saved before the instrument list'}</div>
              </div>
              <div style={{ ...css('flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding:9px 12px;border-radius:13px'), background: tint }}>
                <span data-testid="detail-result" style={{ ...css('font-size:19px;font-weight:700;letter-spacing:-.3px;font-variant-numeric:tabular-nums;line-height:1.1'), color: tone }}>{money ?? resultLabel[trade.result]}</span>
                {money && <span style={{ ...css('font-size:11.5px;font-weight:700'), color: tone }}>{resultLabel[trade.result]}</span>}
              </div>
            </div>
          </section>

          <section aria-label="Trade facts" style={css('flex:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px')}>
            <Fact label="Date">{longDate(trade.tradeDate)}</Fact>
            <Fact label="Direction"><DirectionBadge direction={trade.direction} size="large" /></Fact>
            <Fact label="Risk : Reward" testId="detail-rr">{formatRiskReward(trade.riskReward)}</Fact>
            <Fact label="Result"><span style={{ color: tone }}>{resultLabel[trade.result]}</span></Fact>
            <Fact label="P&L">{money ? <span style={{ color: tone }}>{money}</span> : notRecorded}</Fact>
            <Fact label="Strategy">{trade.strategy ?? notRecorded}</Fact>
          </section>

          <section aria-labelledby="trade-mistakes" className="jr-card" style={css('padding:16px;display:flex;flex-direction:column;gap:11px')}>
            <h2 id="trade-mistakes" style={css('margin:0;font-size:14.5px;font-weight:700;letter-spacing:-.2px')}>Mistakes &amp; notes</h2>
            {trade.followedPlan === true && (
              <span style={css('align-self:flex-start;padding:6px 11px;border-radius:999px;background:var(--success-soft);color:var(--success-ink);font-size:12px;font-weight:700')}>✓ No mistakes — followed the plan</span>
            )}
            {trade.mistakes.length > 0 && (
              <div style={css('display:flex;flex-wrap:wrap;gap:6px')}>
                {trade.mistakes.map(tag => (
                  <span key={tag} style={css('padding:6px 11px;border-radius:999px;background:var(--warning-soft);color:var(--warning-ink);font-size:12px;font-weight:600')}>{mistakeLabel(tag)}</span>
                ))}
              </div>
            )}
            {trade.notes
              ? <p data-testid="detail-notes" style={css('margin:0;font-size:14px;line-height:1.6;color:var(--text-primary);white-space:pre-wrap;overflow-wrap:anywhere')}>{trade.notes}</p>
              : trade.followedPlan !== true && !trade.mistakes.length && <p style={css('margin:0;font-size:13px;color:var(--text-faint)')}>Nothing recorded.</p>}
          </section>

          <section aria-labelledby="trade-screenshot" className="jr-card" style={css('padding:16px;display:flex;flex-direction:column;gap:11px')}>
            <h2 id="trade-screenshot" style={css('margin:0;font-size:14.5px;font-weight:700;letter-spacing:-.2px')}>Chart screenshot</h2>
            {trade.screenshot
              ? <><JournalScreenshot trade={trade} /><div style={css('font-size:11.5px;color:var(--text-faint)')}>Shown whole. Tap to open it full screen and zoom.</div></>
              : <div style={css('padding:18px;border-radius:13px;background:var(--surface-secondary);font-size:13px;color:var(--text-faint);text-align:center')}>No screenshot added.</div>}
          </section>

          <div style={css('flex:none;padding:0 4px;font-size:11.5px;color:var(--text-faint);line-height:1.6')}>
            Logged {stamp(trade.createdAt)}{trade.updatedAt && Math.abs(new Date(trade.updatedAt).getTime() - new Date(trade.createdAt).getTime()) > 60_000 ? ` · Edited ${stamp(trade.updatedAt)}` : ''}
          </div>

          <button type="button" onClick={() => { setDeleteError(null); setConfirming(true); }} className="pressable"
            style={css('flex:none;height:48px;border-radius:13px;border:1px solid var(--danger-border);background:var(--surface);font-size:14px;font-weight:700;color:var(--danger-ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
            Delete Trade
          </button>
        </div>
      )}

      <JournalToast message={notice} />
      {confirming && trade && (
        <ConfirmDialog title="Delete this trade?" danger busy={deleting} error={deleteError} confirmLabel="Delete trade"
          body={<>The {symbolLabel(trade.symbol)} trade from {longDate(trade.tradeDate)}{trade.screenshot ? ' and its screenshot' : ''} will be removed for good. This cannot be undone.</>}
          onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />
      )}
    </PhoneShell>
  );
}
