import { useRef } from 'react';
import { css } from '../lib/css';
import { StatusBar } from '../components/StatusBar';
import { BottomNav } from '../components/BottomNav';
import { PhoneShell } from '../components/PhoneShell';

/**
 * Market News.
 *
 * The screen previously rendered a hard-coded list of headlines, each bylined
 * to a real newsroom. None of it was real. Invented market news is bad enough
 * on a trading app; invented market news carrying a real publisher's name is
 * worse, so it is gone rather than replaced with different placeholder copy.
 *
 * The route, the header and the bottom navigation stay exactly as they were.
 * The category filter went with the data — chips that filter nothing are dead
 * controls — and comes back when there is a feed to filter.
 */
export function MarketNewsScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PhoneShell scrollRef={scrollRef}>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Market News</div>

      <div ref={scrollRef} style={css('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 38px;text-align:center;overflow-y:auto')}>
        <div style={css('width:68px;height:68px;border-radius:22px;background:#F2F6FE;border:1px solid #E7EEFC;display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" />
            <path d="M12.8 3.7v4.8H17.9" />
            <path d="M9.4 12.6h5.2M9.4 16h3.6" />
          </svg>
        </div>

        <div style={css('margin-top:20px;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Market News is coming soon</div>
        <div style={css('margin-top:9px;font-size:12.5px;color:#64748B;line-height:1.55')}>
          We're connecting a live market feed. Until it's ready this screen stays empty rather than
          showing headlines we can't stand behind.
        </div>
        <div style={css('margin-top:18px;font-size:11.5px;color:#94A3B8;line-height:1.5')}>
          For analysis from the team in the meantime, check Official updates in Community.
        </div>
      </div>

      <BottomNav active="news" />
    </PhoneShell>
  );
}
