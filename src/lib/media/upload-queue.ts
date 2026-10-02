/**
 * Uploads several attachments at once, the way a chat app does: a few at a
 * time (never all together on a phone link), each with its own progress,
 * retry and cancel, and an overall figure for the whole batch.
 *
 * The queue owns no storage logic. `run` does one item's work — ask for an
 * upload address, send the bytes — and resolves with whatever the caller needs
 * to publish it. A finished item keeps its result, so retrying the batch after
 * one failure never uploads (or publishes) a finished item twice.
 */
export type UploadState = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadItem<T, R> {
  id: string;
  payload: T;
  state: UploadState;
  /** 0..1 for this item. */
  progress: number;
  error?: string;
  result?: R;
}

export interface UploadQueueOptions<T, R> {
  /** How many items upload at the same time. */
  concurrency?: number;
  run: (item: UploadItem<T, R>, signal: AbortSignal, onProgress: (fraction: number) => void) => Promise<R>;
  onChange?: (items: UploadItem<T, R>[]) => void;
}

let serial = 0;

export class UploadQueue<T, R> {
  private items: UploadItem<T, R>[] = [];
  private controllers = new Map<string, AbortController>();
  private waiters: (() => void)[] = [];
  private readonly concurrency: number;

  constructor(private readonly options: UploadQueueOptions<T, R>) {
    this.concurrency = Math.max(1, options.concurrency ?? 3);
  }

  /** Adds items in this order; they start as soon as a slot is free. */
  add(payloads: T[], start = true): string[] {
    const added = payloads.map(payload => ({ id: `u${Date.now().toString(36)}-${++serial}`, payload, state: 'queued' as const, progress: 0 }));
    this.items = [...this.items, ...added];
    this.changed();
    if (start) this.pump();
    return added.map(item => item.id);
  }

  /** Starts (or resumes) every queued item. */
  start(): void { this.pump(); }

  list(): UploadItem<T, R>[] { return this.items; }

  /** Uploads one failed or cancelled item again; a finished item is never re-run. */
  retry(id: string): void {
    this.update(id, item => (item.state === 'failed' || item.state === 'cancelled') ? { ...item, state: 'queued', progress: 0, error: undefined } : item);
    this.pump();
  }

  /** Retries every failed item. */
  retryFailed(): void {
    this.items = this.items.map(item => item.state === 'failed' ? { ...item, state: 'queued', progress: 0, error: undefined } : item);
    this.changed();
    this.pump();
  }

  /** Stops one item (aborting its transfer); the others carry on. */
  cancel(id: string): void {
    this.controllers.get(id)?.abort();
    this.update(id, item => (item.state === 'queued' || item.state === 'uploading') ? { ...item, state: 'cancelled' } : item);
    this.settleCheck();
  }

  cancelAll(): void {
    for (const item of this.items) if (item.state === 'queued' || item.state === 'uploading') this.cancel(item.id);
  }

  /** Takes an item out of the batch altogether (cancelling it first). */
  remove(id: string): void {
    this.cancel(id);
    this.items = this.items.filter(item => item.id !== id);
    this.changed();
    this.settleCheck();
  }

  /** Moves an item to a new position (0-based), for reordering before sending. */
  move(id: string, to: number): void {
    const from = this.items.findIndex(item => item.id === id);
    if (from < 0) return;
    const next = [...this.items];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
    this.items = next;
    this.changed();
  }

  /** Resolves when nothing is queued or uploading. */
  whenSettled(): Promise<void> {
    if (!this.busy()) return Promise.resolve();
    return new Promise(resolve => this.waiters.push(resolve));
  }

  /** Overall progress over the items that are still part of the batch. */
  overall(): { total: number; done: number; failed: number; fraction: number } {
    const live = this.items.filter(item => item.state !== 'cancelled');
    const total = live.length;
    const done = live.filter(item => item.state === 'done').length;
    const failed = live.filter(item => item.state === 'failed').length;
    const fraction = total ? live.reduce((sum, item) => sum + (item.state === 'done' ? 1 : item.progress), 0) / total : 0;
    return { total, done, failed, fraction };
  }

  private busy(): boolean {
    return this.items.some(item => item.state === 'queued' || item.state === 'uploading');
  }

  private pump(): void {
    let running = this.items.filter(item => item.state === 'uploading').length;
    for (const item of this.items) {
      if (running >= this.concurrency) break;
      if (item.state !== 'queued') continue;
      running++;
      void this.runOne(item.id);
    }
    this.settleCheck();
  }

  private async runOne(id: string): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.update(id, item => ({ ...item, state: 'uploading', progress: 0, error: undefined }));
    const current = this.items.find(item => item.id === id);
    if (!current) return;
    try {
      const result = await this.options.run(current, controller.signal, fraction => {
        if (!controller.signal.aborted) this.update(id, item => item.state === 'uploading' ? { ...item, progress: Math.max(0, Math.min(1, fraction)) } : item);
      });
      if (controller.signal.aborted) return;
      this.update(id, item => item.state === 'uploading' ? { ...item, state: 'done', progress: 1, result } : item);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Upload failed.';
      this.update(id, item => item.state === 'uploading' ? { ...item, state: 'failed', error: message } : item);
    } finally {
      this.controllers.delete(id);
      this.pump();
    }
  }

  private update(id: string, change: (item: UploadItem<T, R>) => UploadItem<T, R>): void {
    let touched = false;
    this.items = this.items.map(item => {
      if (item.id !== id) return item;
      const next = change(item);
      touched = touched || next !== item;
      return next;
    });
    if (touched) this.changed();
  }

  private changed(): void {
    this.options.onChange?.(this.items);
  }

  private settleCheck(): void {
    if (this.busy()) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }
}
