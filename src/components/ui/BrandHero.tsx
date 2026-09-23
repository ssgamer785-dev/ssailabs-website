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
 * Built entirely from existing theme tokens rather than new colours, so it
 * follows light and dark without a second definition to keep in step. The base
 * is --ink-chip-2 → --ink-chip, which is a deep navy in light mode and a
 * softer slate in dark; --on-accent is legible on both, and --gold is the one
 * accent that reads as premium against either.
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
        'background:linear-gradient(145deg,var(--ink-chip-2) 0%,var(--ink-chip) 100%);' +
        'box-shadow:0 14px 30px rgba(var(--shadow-rgb),.22);' +
        'padding:20px 20px 18px;color:var(--on-accent);' +
        // isolation keeps the decorative layers below from blending with
        // whatever sits behind the card on the page.
        'isolation:isolate',
      )}
    >
      {/* Two soft lights, one warm and one accent, placed off-centre so the
          panel has depth without anything on it looking like a reading. */}
      <div
        aria-hidden="true"
        style={css(
          'position:absolute;inset:0;pointer-events:none;' +
          'background:radial-gradient(120% 90% at 88% -10%,rgba(217,166,63,.28) 0%,rgba(217,166,63,0) 58%),' +
          'radial-gradient(90% 80% at -5% 110%,rgba(28,110,246,.34) 0%,rgba(28,110,246,0) 62%)',
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
        <div
          style={css(
            'flex:none;width:62px;height:62px;border-radius:18px;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);' +
            'box-shadow:0 6px 16px rgba(0,0,0,.22)',
          )}
        >
          <img
            src={mark}
            alt="The Traders Planet"
            decoding="async"
            style={css('width:46px;height:46px;object-fit:contain;display:block')}
          />
        </div>

        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
          <div style={css('font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--gold);white-space:nowrap')}>
            THE TRADERS PLANET
          </div>
          <div style={css('font-size:19px;font-weight:800;letter-spacing:-.5px;line-height:1.18;text-wrap:balance')}>
            Trade with structure.
          </div>
          <div style={css('font-size:11.5px;line-height:1.45;color:rgba(255,255,255,.72);text-wrap:pretty')}>
            Official analysis, a community that shows its work, and the tools to size it properly.
          </div>
        </div>
      </div>

      {/* A gold hairline rather than a row of statistics. Anything with a
          number in it here would have to be invented. */}
      <div
        aria-hidden="true"
        style={css('position:relative;margin-top:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--gold) 0%,rgba(217,166,63,.35) 38%,rgba(217,166,63,0) 100%)')}
      />
    </div>
  );
}
