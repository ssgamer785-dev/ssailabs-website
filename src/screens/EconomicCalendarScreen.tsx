import { css } from '../lib/css';
import { PhoneShell } from '../components/PhoneShell';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { TradingViewEconomicCalendar } from '../components/TradingViewEconomicCalendar';

/**
 * The Economic Calendar.
 *
 * This screen used to be "Market News" with two tabs: the calendar, and a News
 * tab that had nothing behind it and said so. A tab that exists only to
 * apologise for itself is a tab worth removing — it made the calendar, which
 * is the working feature, look like half of something rather than the whole
 * thing.
 *
 * So the News tab and the segmented control above it are gone, and the screen
 * is named after what it does. The TradingView widget itself is untouched: it
 * is real data from the source that owns it, and it is the only thing here.
 */
export function EconomicCalendarScreen() {
  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>
        Economic Calendar
      </div>

      {/* The widget sizes itself to this box, so it needs a definite height to
          measure against rather than a scroll container to grow inside. With
          the segmented control gone it now gets the height that control used
          to take, which is why the padding moved up rather than away. */}
      <div className="nav-space" style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:4px 12px 0')}>
        <TradingViewEconomicCalendar />
      </div>

      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
