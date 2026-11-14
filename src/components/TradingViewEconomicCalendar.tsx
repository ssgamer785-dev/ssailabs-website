import { useEffect, useRef, useState } from 'react';
import { css } from '../lib/css';
import { useTheme } from '../lib/theme';

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

type Status = 'loading' | 'ready' | 'failed';

export function TradingViewEconomicCalendar() {
  const hostRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [status, setStatus] = useState<Status>('loading');

  // Re-mounted on a theme change: colorTheme is read once when the widget
  // boots, so the frame has to be rebuilt rather than re-styled.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setStatus('loading');
    host.replaceChildren();

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
    const settle = (next: Status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      observer.disconnect();
      setStatus(next);
    };

    // The widget signals nothing when it is ready, so readiness is the moment
    // its iframe appears.
    const observer = new MutationObserver(() => {
      if (container.querySelector('iframe')) settle('ready');
    });
    observer.observe(container, { childList: true, subtree: true });

    script.onerror = () => settle('failed');
    const timer = window.setTimeout(() => settle('failed'), LOAD_TIMEOUT_MS);

    container.appendChild(script);
    host.appendChild(container);

    // An iframe already present before the observer attaches.
    if (container.querySelector('iframe')) settle('ready');

    return () => {
      settled = true;
      window.clearTimeout(timer);
      observer.disconnect();
      host.replaceChildren();
    };
  }, [theme]);

  return (
    <div style={css('position:relative;flex:1;min-height:0;width:100%;overflow:hidden')}>
      <div
        ref={hostRef}
        aria-label="Economic calendar"
        style={{
          ...css('height:100%;width:100%'),
          // Hidden rather than unmounted while loading: the widget needs a
          // laid-out container to measure itself against.
          visibility: status === 'ready' ? 'visible' : 'hidden',
        }}
      />

      {status !== 'ready' && (
        <div
          role={status === 'failed' ? 'alert' : 'status'}
          style={css('position:absolute;inset:0;display:flex;align-items:center;' +
                     'justify-content:center;padding:0 34px;text-align:center')}
        >
          {/* Same shape every other loading state in the app uses — plain text
              at the faint weight, no spinner, because the app has none. */}
          <span style={css('font-size:12.5px;color:var(--text-faint);line-height:1.55;text-wrap:pretty')}>
            {status === 'loading'
              ? 'Loading economic calendar…'
              : 'Economic Calendar is temporarily unavailable.'}
          </span>
        </div>
      )}
    </div>
  );
}
