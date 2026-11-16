/**
 * A one-time message from one journal screen to the next ("Trade saved",
 * "Trade deleted"), kept in memory. The form and the trade page go BACK in
 * history after saving or deleting, rather than stacking a new journal screen
 * the Back button would then have to walk through; history entries cannot
 * carry state that way, so the message waits here for the screen that shows it.
 */
export type JournalFlash =
  | { kind: 'saved'; id: string; tradeDate: string }
  | { kind: 'edited'; id: string }
  | { kind: 'deleted' };

let pending: JournalFlash | null = null;

export function setJournalFlash(flash: JournalFlash): void { pending = flash; }

/** The waiting message if it is one of `kinds` (and then it is gone), else null. */
export function takeJournalFlash<K extends JournalFlash['kind']>(...kinds: K[]): Extract<JournalFlash, { kind: K }> | null {
  if (!pending || !kinds.includes(pending.kind as K)) return null;
  const flash = pending as Extract<JournalFlash, { kind: K }>;
  pending = null;
  return flash;
}
