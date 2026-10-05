/**
 * When the economic calendar is loaded again.
 *
 * TradingView's widget is configured once, when it boots, and has no refresh
 * setting of its own (its options are filters, size, theme and language). It
 * shows the events as they were when it loaded: a calendar left open — or an
 * app brought back from the background hours later — kept showing releases
 * without their actual figures. The data itself is TradingView's, fetched
 * fresh on every load; this only decides when to load it again.
 */
export const CALENDAR_REFRESH = {
  /** While the calendar is on screen and nobody is using it. */
  everyMs: 10 * 60_000,
  /** Back from the background (another app, the phone locked) after at least this long. */
  afterHiddenMs: 60_000,
};

export type CalendarStatus = 'loading' | 'ready' | 'failed' | 'offline';

export interface CalendarState {
  status: CalendarStatus;
  /** Since the calendar on screen was loaded. */
  sinceLoadMs: number;
  /** How long the app was in the background, when it has just come back. */
  hiddenForMs: number;
  /** The member is using the calendar (it has the focus): never reloaded under their finger. */
  interacting: boolean;
  online: boolean;
  visible: boolean;
}

export type CalendarTrigger = 'visible' | 'online' | 'tick';

export function calendarShouldReload(trigger: CalendarTrigger, state: CalendarState): boolean {
  if (!state.online) return false;
  if (trigger === 'online') return state.status !== 'ready';
  if (trigger === 'visible') return state.status !== 'loading' && (state.status !== 'ready' || state.hiddenForMs >= CALENDAR_REFRESH.afterHiddenMs);
  return state.visible && state.status === 'ready' && !state.interacting && state.sinceLoadMs >= CALENDAR_REFRESH.everyMs;
}
