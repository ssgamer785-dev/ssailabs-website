import { useRef, useState } from 'react';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { TradingViewEconomicCalendar } from '../components/TradingViewEconomicCalendar';

/**
 * Market News.
 *
 * The screen previously rendered a hard-coded list of headlines, each bylined
 * to a real newsroom. None of it was real. Invented market news is bad enough
 * on a trading app; invented market news carrying a real publisher's name is
 * worse, so it is gone rather than replaced with different placeholder copy.
 *
 * It now carries TradingView's official Economic Calendar, which is real data
 * from a source that owns it, so the screen leads with that. The headline feed
 * keeps its honest empty state on the second tab until there is a feed to
 * show. The route, the header and the bottom navigation are unchanged.
 */

type Tab = 'calendar' | 'news';

export function MarketNewsScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('calendar');

  // Same segmented control the Community screen uses: a pill track, the active
  // option filled with the accent, the inactive one hoverable.
  const option = (value: Tab, label: string) => {
    const active = tab === value;
    return active ? (
      <div
        aria-current="page"
        style={css('flex:1;height:40px;border-radius:999px;background:var(--accent);box-shadow:0 3px 10px rgba(11,95,239,.28);' +
                   'display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;' +
                   'color:var(--on-accent);cursor:pointer;white-space:nowrap')}
      >
        {label}
      </div>
    ) : (
      <Hoverable
        onClick={() => setTab(value)}
        style={css('flex:1;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;' +
                   'font-size:14px;font-weight:500;color:var(--text-tertiary);cursor:pointer;white-space:nowrap')}
        hoverStyle={css('background:rgba(255,255,255,.7)')}
      >
        {label}
      </Hoverable>
    );
  };

  return (
    <PhoneShell scrollRef={scrollRef}>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Market News</div>

      <div style={css('flex:none;margin:0 20px 12px;padding:4px;background:var(--surface-track);border-radius:999px;display:flex;gap:4px')}>
        {option('calendar', 'Economic Calendar')}
        {option('news', 'News')}
      </div>

      {tab === 'calendar' ? (
        // The widget sizes itself to this box, so it gets a definite height to
        // measure against rather than a scroll container to grow inside.
        <div className="nav-space" style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:0 12px')}>
          <TradingViewEconomicCalendar />
        </div>
      ) : (
        <div ref={scrollRef} className="nav-space" style={css('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 38px;text-align:center;overflow-y:auto')}>
          <div style={css('width:68px;height:68px;border-radius:22px;background:var(--accent-tint);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" />
              <path d="M12.8 3.7v4.8H17.9" />
              <path d="M9.4 12.6h5.2M9.4 16h3.6" />
            </svg>
          </div>

          <div style={css('margin-top:20px;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Market News is coming soon</div>
          <div style={css('margin-top:9px;font-size:12.5px;color:var(--text-muted);line-height:1.55')}>
            We're connecting a live market feed. Until it's ready this screen stays empty rather than
            showing headlines we can't stand behind.
          </div>
          <div style={css('margin-top:18px;font-size:11.5px;color:var(--text-faint);line-height:1.5')}>
            For analysis from the team in the meantime, check Official updates in Community.
          </div>
        </div>
      )}

      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
