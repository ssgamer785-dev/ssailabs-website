import { describe, expect, it } from 'bun:test';
import { mergeFirstPage } from './comments-merge';

const c = (id: string, minute: number, extra: object = {}) => ({ id, createdAt: `2026-09-27T10:${String(minute).padStart(2, '0')}:00Z`, ...extra });

describe('merging a refreshed first page', () => {
  it('keeps the older comments a reader already loaded', () => {
    const onScreen = [c('c5', 50), c('c4', 40), c('c3', 30), c('c2', 20), c('c1', 10)];
    const fresh = [c('c6', 55), c('c5', 50), c('c4', 40)];
    expect(mergeFirstPage(onScreen, fresh).map(x => x.id)).toEqual(['c6', 'c5', 'c4', 'c3', 'c2', 'c1']);
  });
  it('takes the fresh copy of anything the new page covers (edits, removals)', () => {
    const onScreen = [c('c5', 50, { body: 'old' }), c('c4', 40)];
    const fresh = [c('c5', 50, { body: 'new' })];
    const merged = mergeFirstPage(onScreen, fresh) as Array<{ id: string; body?: string }>;
    expect(merged.map(x => x.id)).toEqual(['c5', 'c4']);
    expect(merged[0].body).toBe('new');
  });
  it('keeps a comment that is still being sent', () => {
    const onScreen = [c('tmp', 59, { pending: true }), c('c1', 10)];
    expect(mergeFirstPage(onScreen, [c('c1', 10)]).map(x => x.id)).toEqual(['c1', 'tmp']);
  });
  it('an empty fresh page clears the thread (everything was deleted)', () => {
    expect(mergeFirstPage([c('c1', 10)], [])).toEqual([]);
  });
});
