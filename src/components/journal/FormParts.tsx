import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { isListedSymbol, recentSymbols, searchSymbols, symbolLabel, type SymbolOption } from '../../lib/journal/symbols';

// ---------------------------------------------------------------------------------------------------------------
// Layout: a card per part of the trade, a label above every control
// ---------------------------------------------------------------------------------------------------------------

export function FormSection({ title, caption, children, testId }: { title: string; caption?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="jr-card" data-testid={testId} style={css('padding:16px;display:flex;flex-direction:column;gap:16px')}>
      <header style={css('display:flex;flex-direction:column;gap:2px')}>
        <h2 style={css('margin:0;font-size:15px;font-weight:700;letter-spacing:-.25px;color:var(--text-primary)')}>{title}</h2>
        {caption && <p style={css('margin:0;font-size:12px;color:var(--text-muted);line-height:1.4')}>{caption}</p>}
      </header>
      {children}
    </section>
  );
}

const problemIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" style={css('flex:none;margin-top:1px')}>
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4h.01" />
  </svg>
);

/** A labelled control. `labelFor` ties the label to a single input; a group (radios) names itself instead. */
export function Field({ id, label, labelFor, hint, problem, optional, children }: {
  id: string; label: string; labelFor?: string; hint?: ReactNode; problem?: string; optional?: boolean; children: ReactNode;
}) {
  const Label = labelFor ? 'label' : 'div';
  return (
    <div id={`field-${id}`} style={css('display:flex;flex-direction:column;gap:8px;min-width:0;scroll-margin:16px')}>
      <Label className="jr-label" {...(labelFor ? { htmlFor: labelFor } : { id: `label-${id}` })} style={css('display:flex;align-items:baseline;gap:6px')}>
        {label}
        {optional && <span style={css('font-size:11px;font-weight:500;color:var(--text-faint)')}>Optional</span>}
      </Label>
      {children}
      {problem
        ? <div role="alert" className="jr-problem">{problemIcon}<span>{problem}</span></div>
        : hint ? <div className="jr-hint">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Segmented choice (radio group): equal columns that always fit, the chosen one filled in its colour
// ---------------------------------------------------------------------------------------------------------------

export interface SegOption<T extends string> { value: T; label: string; icon?: ReactNode; tone?: 'up' | 'down' | 'neutral' }

export function Segmented<T extends string>({ label, labelledBy, options, value, onChange, tiles, invalid, testId }: {
  label?: string; labelledBy?: string; options: SegOption<T>[]; value: T | null; onChange: (value: T) => void; tiles?: boolean; invalid?: boolean; testId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} data-testid={testId}
      className={`jr-seg${tiles ? ' is-tiles' : ''}${invalid ? ' is-invalid' : ''}`} style={{ ['--jr-n' as string]: options.length }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} data-tone={o.tone}
            tabIndex={on || (value === null && i === 0) ? 0 : -1} className="jr-seg-btn pressable"
            onClick={() => onChange(o.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
            }}>
            {o.icon && <span className="jr-dot" aria-hidden="true">{o.icon}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const glyph = (d: string, width = 2.4) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

// ---------------------------------------------------------------------------------------------------------------
// Symbol: the Risk Calculator's instruments, searchable in a sheet
// ---------------------------------------------------------------------------------------------------------------

const chevron = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={css('flex:none')}>
    <path d="M6 9.5l6 6 6-6" />
  </svg>
);

export function SymbolField({ value, recent, invalid, onChange }: { value: string; recent: string[]; invalid?: boolean; onChange: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const listed = isListedSymbol(value);
  return (
    <>
      <button ref={button} type="button" id="journal-symbol" aria-haspopup="dialog" aria-label={value ? `Symbol: ${symbolLabel(value)}. Change symbol` : 'Choose symbol'}
        aria-invalid={invalid || undefined} onClick={() => setOpen(true)} className="jr-control jr-tap"
        style={css('display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer')}>
        <span style={css('flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;overflow:hidden')}>
          {value ? (
            <>
              <span data-testid="symbol-value" style={css('font-weight:700;letter-spacing:.01em;white-space:nowrap')}>{symbolLabel(value)}</span>
              {!listed && <span style={css('font-size:11.5px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>saved earlier</span>}
            </>
          ) : <span style={css('color:var(--text-placeholder)')}>Choose a symbol</span>}
        </span>
        {chevron}
      </button>
      {open && (
        <SymbolSheet value={value} recent={recent}
          onPick={symbol => { onChange(symbol); setOpen(false); window.setTimeout(() => button.current?.focus(), 0); }}
          onClose={() => { setOpen(false); window.setTimeout(() => button.current?.focus(), 0); }} />
      )}
    </>
  );
}

/** Follows the on-screen keyboard: the sheet's height is what is still visible. */
function useVisibleHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() => window.visualViewport?.height ?? null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setHeight(viewport.height);
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return height;
}

function SymbolSheet({ value, recent, onPick, onClose }: { value: string; recent: string[]; onPick: (symbol: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => searchSymbols(query), [query]);
  const recents = useMemo(() => (query ? [] : recentSymbols(recent)), [query, recent]);
  const visible = useVisibleHeight();
  const unlisted = value && !isListedSymbol(value) ? value : null;

  useEffect(() => {
    // A keyboard would cover half the list on a phone: focus the search straight away only with a mouse.
    if (window.matchMedia?.('(pointer: fine)').matches) search.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (o: SymbolOption) => {
    const on = o.symbol === value;
    return (
      <li key={o.symbol} role="presentation">
        <button type="button" role="option" aria-selected={on} onClick={() => onPick(o.symbol)} className="jr-tap" data-testid="symbol-option"
          style={css('width:100%;min-height:50px;padding:0 20px;border:0;background:transparent;display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;color:var(--text-primary);font:inherit')}>
          <span style={css('flex:1;min-width:0;display:flex;align-items:baseline;gap:9px')}>
            <span style={css('font-size:15px;font-weight:700')}>{o.label}</span>
            {o.label !== o.symbol && <span style={css('font-size:12px;color:var(--text-faint)')}>{o.symbol}</span>}
          </span>
          {on && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </button>
      </li>
    );
  };

  return createPortal(
    <div className="jr-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ ...css('position:fixed;left:0;right:0;top:0;z-index:1000;display:flex;align-items:flex-end;justify-content:center;background:rgba(7,15,31,.42)'),
        height: visible ? `${visible}px` : '100dvh', top: window.visualViewport?.offsetTop ?? 0 }}>
      <section role="dialog" aria-modal="true" aria-label="Choose symbol" className="jr-sheet" data-testid="symbol-sheet"
        style={css('width:100%;max-width:520px;height:min(100%, 640px);display:flex;flex-direction:column;background:var(--surface);border-radius:20px 20px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.18);overflow:hidden')}>
        <header style={css('flex:none;padding:14px 16px 12px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--surface-divider)')}>
          <h2 style={css('margin:0;flex:1;font-size:16px;font-weight:700;letter-spacing:-.3px')}>Choose symbol</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="pressable icon-button"
            style={css('width:36px;height:36px;border:0;border-radius:50%;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div style={css('flex:none;padding:12px 16px')}>
          <div className="jr-control" style={css('display:flex;align-items:center;gap:9px;height:44px;background:var(--surface-secondary);border-color:transparent')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" style={css('flex:none')}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input ref={search} value={query} onChange={e => setQuery(e.target.value)} type="search" enterKeyHint="search"
              aria-label="Search symbols" placeholder="Search, e.g. XAU, EUR/USD, crypto" autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} />
          </div>
        </div>
        <div role="listbox" aria-label="Symbols" style={css('flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-bottom:calc(16px + env(safe-area-inset-bottom, 0px))')}>
          {unlisted && !query && (
            <div style={css('padding:4px 20px 12px;font-size:12px;color:var(--text-muted);line-height:1.45')}>
              This trade was saved as <strong style={css('color:var(--text-primary)')}>{unlisted}</strong>, which is not in the Risk Calculator list. It stays unless you pick another.
            </div>
          )}
          {recents.length > 0 && (
            <div style={css('padding:0 16px 12px;display:flex;flex-direction:column;gap:8px')}>
              <div style={css('padding:0 4px;font-size:11.5px;font-weight:700;color:var(--text-faint);letter-spacing:.04em;text-transform:uppercase')}>Recent</div>
              <div style={css('display:flex;gap:7px;flex-wrap:wrap')}>
                {recents.map(o => (
                  <button key={o.symbol} type="button" className="jr-chip pressable" aria-pressed={o.symbol === value} onClick={() => onPick(o.symbol)}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
          {groups.length === 0 ? (
            <div style={css('padding:28px 24px;text-align:center;font-size:13px;color:var(--text-muted);line-height:1.5')}>
              No instrument matches “{query.trim()}”. The journal lists the same instruments as the Risk Calculator.
            </div>
          ) : groups.map(g => (
            <div key={g.group} role="group" aria-label={g.group}>
              <div style={css('position:sticky;top:0;z-index:1;padding:8px 20px;background:var(--surface-secondary-2);font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:.04em;text-transform:uppercase')}>{g.group}</div>
              <ul role="presentation" style={css('list-style:none;margin:0;padding:0')}>{g.options.map(row)}</ul>
            </div>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
