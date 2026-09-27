/**
 * The greeting on Home, in India time.
 *
 * The Traders Planet runs on Indian market hours, so "Good Morning" has to
 * mean morning in Kolkata whether the person is opening the app from Mumbai,
 * Dubai or London. Reading the device clock would give a member abroad a
 * greeting that disagrees with the session everyone else is trading.
 *
 * Asia/Kolkata is UTC+05:30 with no daylight saving, but this asks Intl rather
 * than adding 5.5 hours: a hard-coded offset is a fact about today that stops
 * being true the moment a zone's rules change, and the browser already carries
 * the tz database.
 */

export type Greeting = 'Good Morning' | 'Good Afternoon' | 'Good Evening' | 'Good Night';

export const INDIA_TIME_ZONE = 'Asia/Kolkata';

/**
 * The hour 0–23 in India right now.
 *
 * hourCycle 'h23' rather than hour12:false, because the two are not the same:
 * with hour12:false some engines render midnight as "24", which would fall
 * outside every band below and quietly hand back the wrong greeting for one
 * hour a day. 'h23' pins it to 0–23.
 *
 * If Intl refuses the zone at all — an engine built without full ICU — the
 * device hour is used instead. A greeting an hour out is better than a screen
 * that throws.
 */
export function indiaHour(now: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: INDIA_TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now);
    const parsed = Number(hour);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 23) return parsed;
  } catch {
    /* no ICU data for this zone; fall through */
  }
  return now.getHours();
}

/**
 * 04:00–11:59 Morning · 12:00–16:59 Afternoon · 17:00–23:59 Evening ·
 * 00:00–03:59 Night.
 *
 * Written as ascending bands with Night last, so the four are exhaustive and
 * the small-hours case is the one that falls through rather than a condition
 * someone has to reason about.
 */
export function greetingForHour(hour: number): Greeting {
  if (hour >= 4 && hour <= 11) return 'Good Morning';
  if (hour >= 12 && hour <= 16) return 'Good Afternoon';
  if (hour >= 17 && hour <= 23) return 'Good Evening';
  return 'Good Night';
}

/** The greeting to show right now, in India time. */
export function indiaGreeting(now: Date = new Date()): Greeting {
  return greetingForHour(indiaHour(now));
}

/**
 * Milliseconds until the India hour ticks over.
 *
 * Used to schedule the next re-render rather than polling every minute: a
 * greeting changes four times a day, and a timer that fires 1,440 times to
 * catch it is 1,436 wake-ups of nothing.
 */
export function msUntilNextIndiaHour(now: Date = new Date()): number {
  const ms = now.getTime();
  const nextHour = Math.floor(ms / 3_600_000) * 3_600_000 + 3_600_000;
  // India's offset is a whole number of minutes, so an hour boundary there is
  // also an hour boundary in UTC — the wall clock reads :30, but it ticks in
  // step. +1s so the timer never fires a hair early and reads the old hour.
  return Math.max(1_000, nextHour - ms + 1_000);
}
