import { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '../lib/css';
import { useTheme } from '../lib/theme';
import { calendarShouldReload, type CalendarStatus } from '../lib/calendar-refresh';

/**
 * TradingView's official Economic Calendar widget.
 *
 * The embed is theirs: a script tag whose text body is the config, dropped
 * into a container they then fill with an iframe. Everything inside that frame
 * — layout, columns, the importance markers, the expand behaviour — is
 * TradingView's own UI and is deliberately left alone. This file only owns the
 * frame around it: sizing, the loading state, and what to show when it does
 * not arrive.
 *
 * The config keys below are the ones the widget actually reads. From the
 * official embed script's own allowlist:
 *
 *   countryFilter, currencyFilter, height, importanceFilter,
 *   locale, width, colorTheme, isTransparent, customer
 *
 * `currencyFilter` is used rather than `countryFilter` because this is a
 * trading app — a reader cares that an event moves GBP, not that it was
 * published in the United Kingdom. The docs UI only exposes countries, but the
 * widget accepts either.
 */

const WIDGET_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';

/** The eight majors — the pairs this community actually trades. */
const CURRENCY_FILTER = 'USD,EUR,GBP,JPY,AUD,CAD,CHF,NZD';

/**
 * Every importance level — the complete economic calendar.
 *
 * TradingView grades events -1 (low), 0 (medium) and 1 (high), and "-1,0,1" is
 * the full set the official embed ships by default. Measured against the live
 * widget, -1 is the one that matters: leave it out and every row comes back
 * tagged "High importance" regardless of whether you ask for "0", "1" or
 * "0,1". Including it is what actually returns the low and medium releases
 * alongside the high ones.
 */
const IMPORTANCE_FILTER = '-1,0,1';

/** Long enough for a cold third-party load on a phone, short enough to not hang. */
const LOAD_TIMEOUT_MS = 20000;
/** A reloaded calendar is shown once its frame has loaded, and a moment more for its rows to draw. */
const SWAP_SETTLE_MS = 900;
/** How often the reload rules are checked while the calendar is open. */
const CHECK_EVERY_MS = 30_000;

const clock = (at: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);

/**
 * TradingView's own widget, loaded again when what it shows may be out of
 * date (see calendar-refresh.ts): back from the background, back online after
 * a failed load, every ten minutes while it is on screen and not being used,
 * or when the member taps Refresh. A reload is built behind the calendar on
 * screen and swapped in once it has drawn, so the member never sees it blank.
 */
export function TradingViewEconomicCalendar() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [status, setStatus] = useState<CalendarStatus>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'loading'));
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const loadedAtRef = useRef(loadedAt);
  loadedAtRef.current = loadedAt;

  const reload = useCallback(() => setGeneration(g => g + 1), []);

  // Re-built on a theme change too: colorTheme is read once when the widget
  // boots, so the frame has to be rebuilt rather than re-styled.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const replacing = host.childElementCount > 0;
    if (!replacing && navigator.onLine === false) { setStatus('offline'); return; }
    if (replacing) setRefreshing(true); else setStatus('loading');

    // Each load is its own layer: a reload waits, hidden, behind the calendar on screen.
    const layer = document.createElement('div');
    layer.style.cssText = `position:absolute;inset:0;${replacing ? 'visibility:hidden;' : ''}`;

    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.cssText = 'height:100%;width:100%';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.cssText = 'height:100%;width:100%';
    container.appendChild(widget);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = WIDGET_SRC;
    script.async = true;
    script.textContent = JSON.stringify({
      colorTheme: theme === 'dark' ? 'dark' : 'light',
      // Opaque on purpose. With isTransparent the widget stops painting its own
      // surface but still draws light row backgrounds, so in dark mode the rows
      // came out white under dark-theme text. Letting it own its background
      // keeps both themes consistent — and its light surface already matches
      // --surface, so nothing shows a seam.
      isTransparent: false,
      locale: 'en',
      currencyFilter: CURRENCY_FILTER,
      importanceFilter: IMPORTANCE_FILTER,
      width: '100%',
      height: '100%',
    });

    let settled = false;
    let swapTimer = 0;
    const settle = (next: 'ready' | 'failed') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(swapTimer);
      observer.disconnect();
      setRefreshing(false);
      if (next === 'ready') {
        layer.style.visibility = 'visible';
        for (const child of [...host.children]) if (child !== layer) child.remove();
        setLoadedAt(Date.now());
        setStatus('ready');
      } else if (replacing) {
        // The calendar on screen stays as it is; it is tried again later.
        layer.remove();
      } else {
        setStatus(navigator.onLine === false ? 'offline' : 'failed');
      }
    };

    // The widget signals nothing when it is ready, so readiness is the moment
    // its iframe appears — or, for a reload, the moment that frame has loaded.
    const observer = new MutationObserver(() => {
      const frame = container.querySelector('iframe');
      if (!frame) return;
      if (!replacing) { settle('ready'); return; }
      observer.disconnect();
      frame.addEventListener('load', () => { swapTimer = window.setTimeout(() => settle('ready'), SWAP_SETTLE_MS); }, { once: true });
    });
    observer.observe(container, { childList: true, subtree: true });

    script.onerror = () => settle('failed');
    const timer = window.setTimeout(() => settle('failed'), LOAD_TIMEOUT_MS);

    layer.appendChild(container);
    container.appendChild(script);
    host.appendChild(layer);

    // An iframe already present before the observer attaches.
    if (!replacing && container.querySelector('iframe')) settle('ready');

    return () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearTimeout(swapTimer);
      observer.disconnect();
      layer.remove();
    };
  }, [theme, generation]);

  // When to load it again.
  useEffect(() => {
    let hiddenAt = 0;
    const state = (hiddenForMs = 0) => {
      const focused = document.activeElement;
      return {
        status: statusRef.current,
        sinceLoadMs: loadedAtRef.current ? Date.now() - loadedAtRef.current : 0,
        hiddenForMs,
        interacting: focused?.tagName === 'IFRAME' && !!hostRef.current?.contains(focused),
        online: navigator.onLine !== false,
        visible: document.visibilityState === 'visible',
      };
    };
    const away = () => { hiddenAt ||= Date.now(); };
    const back = () => {
      if (document.visibilityState === 'hidden') { away(); return; }
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (calendarShouldReload('visible', state(hiddenFor))) reload();
    };
    const online = () => { if (calendarShouldReload('online', state())) reload(); };
    const offline = () => { if (statusRef.current !== 'ready') setStatus('offline'); };
    const check = window.setInterval(() => { if (calendarShouldReload('tick', state())) reload(); }, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('pagehide', away);
    window.addEventListener('pageshow', back);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.clearInterval(check);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('pagehide', away);
      window.removeEventListener('pageshow', back);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [reload]);

  const busy = refreshing || status === 'loading';

  return (
    <div style={css('position:relative;flex:1;min-height:0;width:100%;display:flex;flex-direction:column;overflow:hidden')}>
      {/* When this calendar was loaded from TradingView — the time of the load, not a claim about the data. */}
      <div style={css('flex:none;height:28px;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 4px;font-size:11.5px;color:var(--text-faint);font-variant-numeric:tabular-nums')}>
        <span aria-live="polite">
          {refreshing ? 'Refreshing…' : status === 'offline' ? 'Offline' : loadedAt ? `Loaded ${clock(loadedAt)}` : ''}
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={busy || status === 'offline'}
          className="pressable"
          style={{
            ...css('height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--border-4);font-size:11.5px;font-weight:700;color:var(--text-muted);background:none;cursor:pointer'),
            opacity: busy || status === 'offline' ? 0.5 : 1,
          }}
        >
          Refresh
        </button>
      </div>

      <div style={css('position:relative;flex:1;min-height:0;width:100%')}>
        <div
          ref={hostRef}
          aria-label="Economic calendar"
          style={{
            ...css('position:relative;height:100%;width:100%'),
            // Hidden rather than unmounted while loading: the widget needs a
            // laid-out container to measure itself against.
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
        />

        {status !== 'ready' && (
          <div
            role={status === 'failed' || status === 'offline' ? 'alert' : 'status'}
            style={css('position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;' +
                       'justify-content:center;padding:0 34px;text-align:center')}
          >
            {/* Same shape every other loading state in the app uses — plain text
                at the faint weight, no spinner, because the app has none. */}
            <span style={css('font-size:12.5px;color:var(--text-faint);line-height:1.55;text-wrap:pretty')}>
              {status === 'loading'
                ? 'Loading economic calendar…'
                : status === 'offline'
                  ? 'You’re offline. The calendar loads as soon as you’re back online.'
                  : 'Economic Calendar is temporarily unavailable.'}
            </span>
            {status === 'failed' && (
              <button
                type="button"
                onClick={reload}
                className="pressable"
                style={css('height:32px;padding:0 14px;border-radius:9px;border:1px solid var(--border-4);font-size:12px;font-weight:700;color:var(--text-muted);background:none;cursor:pointer')}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
