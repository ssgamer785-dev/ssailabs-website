/** Realtime may arrive while the initial snapshot is in flight. Never replay
 * historical rows, but retain those actual INSERT events. Polls then repair
 * events missed during a socket disconnect without duplicating delivery. */
export function createIncomingGate<T extends { id: string }>() {
  const seen = new Set<string>();
  const queued: T[] = [];
  let ready = false;

  const accept = (row: T): T | null => {
    if (!row.id || seen.has(row.id)) return null;
    seen.add(row.id);
    if (seen.size > 500) seen.delete(seen.values().next().value!);
    return row;
  };

  return {
    insert(row: T): T | null {
      if (!ready) { queued.push(row); return null; }
      return accept(row);
    },
    baseline(rows: readonly T[]): T[] {
      if (ready) return [];
      const queuedIds = new Set(queued.map(row => row.id));
      for (const row of rows) if (!queuedIds.has(row.id)) accept(row);
      ready = true;
      return queued.map(row => accept(row)).filter((row): row is T => row !== null);
    },
    poll(rows: readonly T[]): T[] {
      if (!ready) return this.baseline(rows);
      return rows.map(row => accept(row)).filter((row): row is T => row !== null);
    },
  };
}
