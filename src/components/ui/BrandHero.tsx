import { css } from '../../lib/css';
import mark from '../../assets/traders-planet-mark.png';

/**
 * The identity panel at the top of Home.
 *
 * It replaces a bright blue "Market Overview" card that held a decorative
 * chart and a "Coming soon" badge — the largest, loudest element on the screen
 * given over to explaining that a feature did not exist yet. This says
 * something true instead: whose platform this is.
 *
 * Built on the app's own accent gradient — --accent-grad-a / --accent-grad-b,
 * the same #1C6EF6 → #0A4FDD blue the Market Overview card itself used to use
 * — rather than a separate navy-and-gold palette invented for this one panel.
 * Both tokens hold the identical hex value in light and dark, so the panel
 * needs no per-theme override to look right in either: it is drawn once.
 *
 * Nothing here is data. There are no numbers, no chart, no ticker and nothing
 * fetched — the only image is the real Traders Planet mark, drawn at its own
 * aspect ratio with object-fit so it cannot stretch.
 */
export function BrandHero() {
  return (
    <div
      style={css(
        'flex:none;margin:0 20px;border-radius:20px;overflow:hidden;position:relative;' +
        'background:linear-gradient(145deg,#102f68 0%,#071c43 100%);' +
        // A blue-tinted shadow, not a generic dark one — the same rgb the FAB
        // and the original Market Overview card used under their own accent
        // surfaces, so a premium blue card here casts a shadow the rest of
        // the app already casts under blue.
        'box-shadow:0 14px 30px rgba(11,95,239,.30);' +
        'padding:20px 20px 18px;color:var(--on-accent);' +
        // isolation keeps the decorative layers below from blending with
        // whatever sits behind the card on the page.
        'isolation:isolate',
      )}
    >
      {/* A single soft white sheen, off to the top-right, for gloss and depth
          on the gradient without introducing a second hue. */}
      <div
        aria-hidden="true"
        style={css(
          'position:absolute;inset:0;pointer-events:none;' +
          'background:radial-gradient(120% 90% at 88% -10%,rgba(255,255,255,.22) 0%,rgba(255,255,255,0) 58%)',
        )}
      />

      {/* A hairline grid, at low opacity — texture, not axes. No ticks, no
          scale and no values, so it cannot be read as a chart. */}
      <svg
        aria-hidden="true"
        focusable="false"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        viewBox="0 0 320 150"
        style={css('position:absolute;inset:0;pointer-events:none;opacity:.10')}
      >
        <g stroke="var(--on-accent)" strokeWidth="1">
          <path d="M0 37.5h320M0 75.5h320M0 112.5h320" />
          <path d="M64.5 0v150M128.5 0v150M192.5 0v150M256.5 0v150" />
        </g>
      </svg>

      <div style={css('position:relative;display:flex;align-items:center;gap:16px')}>
        {/* The real mark, on a translucent plate so it reads on the gradient.
            object-fit:contain, so a non-square asset is never distorted. */}
        <a
          href="https://share.google/nYPfH4WT6rOW64y7P"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open The Traders Planet Google Business Profile"
          style={css(
            'flex:none;width:62px;height:62px;border-radius:18px;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);' +
            'box-shadow:0 6px 16px rgba(0,0,0,.18);cursor:pointer',
          )}
        >
          <img
            src={mark}
            alt="The Traders Planet"
            decoding="async"
            style={css('width:46px;height:46px;object-fit:contain;display:block')}
          />
        </a>

        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
          <div style={css('font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--on-accent);white-space:nowrap')}>
            THE TRADERS PLANET
          </div>
          <div style={css('font-size:19px;font-weight:800;letter-spacing:-.5px;line-height:1.18;text-wrap:balance')}>
            WHERE TRADERS ARE BUILT
          </div>
        </div>
      </div>

      {/* A white hairline rather than a row of statistics. Anything with a
          number in it here would have to be invented. */}
      <div
        aria-hidden="true"
        style={css('position:relative;margin-top:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,.16) 45%,rgba(255,255,255,0) 100%)')}
      />
    </div>
  );
}
