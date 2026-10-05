import { describe, expect, it } from 'bun:test';
import { CALENDAR_REFRESH, calendarShouldReload, type CalendarState } from './calendar-refresh';

const ready: CalendarState = { status: 'ready', sinceLoadMs: 0, hiddenForMs: 0, interacting: false, online: true, visible: true };

describe('when the economic calendar is loaded again', () => {
  it('back from the background after a minute or more — not after a glance away', () => {
    expect(calendarShouldReload('visible', { ...ready, hiddenForMs: CALENDAR_REFRESH.afterHiddenMs })).toBe(true);
    expect(calendarShouldReload('visible', { ...ready, hiddenForMs: 5_000 })).toBe(false);
    // A calendar that had failed, or was waiting for the connection, is tried again on return.
    expect(calendarShouldReload('visible', { ...ready, status: 'failed' })).toBe(true);
    expect(calendarShouldReload('visible', { ...ready, status: 'loading' })).toBe(false);
  });

  it('back online: only if what is on screen is not a loaded calendar', () => {
    expect(calendarShouldReload('online', { ...ready, status: 'offline' })).toBe(true);
    expect(calendarShouldReload('online', { ...ready, status: 'failed' })).toBe(true);
    expect(calendarShouldReload('online', ready)).toBe(false);
  });

  it('every ten minutes while on screen — never while the member is using it, hidden, or offline', () => {
    const due = { ...ready, sinceLoadMs: CALENDAR_REFRESH.everyMs };
    expect(calendarShouldReload('tick', due)).toBe(true);
    expect(calendarShouldReload('tick', { ...due, sinceLoadMs: CALENDAR_REFRESH.everyMs - 1 })).toBe(false);
    expect(calendarShouldReload('tick', { ...due, interacting: true })).toBe(false);
    expect(calendarShouldReload('tick', { ...due, visible: false })).toBe(false);
    expect(calendarShouldReload('tick', { ...due, online: false })).toBe(false);
    expect(calendarShouldReload('tick', { ...due, status: 'failed' })).toBe(false);
  });

  it('nothing is reloaded while offline', () => {
    for (const trigger of ['visible', 'online', 'tick'] as const) {
      expect(calendarShouldReload(trigger, { ...ready, status: 'failed', online: false, hiddenForMs: 10 * 60_000, sinceLoadMs: 60 * 60_000 })).toBe(false);
    }
  });
});
