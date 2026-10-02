import { describe, expect, it } from 'bun:test';
import { mergeThreadPage, threadComments } from './comment-threads';

const c = (id: string, minute: number, parentId: string | null = null, extra: object = {}) =>
  ({ id, parentId, createdAt: `2026-10-02T10:${String(minute).padStart(2, '0')}:00Z`, ...extra });

describe('threading comments', () => {
  it('lists top-level comments newest first, each with its replies oldest first', () => {
    const list = [c('r2', 31, 'a'), c('a', 10), c('b', 20), c('r1', 25, 'a'), c('r3', 22, 'b')];
    expect(threadComments(list).map(t => [t.root.id, t.replies.map(r => r.id)])).toEqual([
      ['b', ['r3']],
      ['a', ['r1', 'r2']],
    ]);
  });
  it('never drops a reply whose comment is not loaded', () => {
    expect(threadComments([c('a', 10), c('orphan', 40, 'gone')]).map(t => t.root.id)).toEqual(['orphan', 'a']);
  });
});

describe('merging a refreshed first page of threads', () => {
  it('keeps older threads the reader loaded, with their replies', () => {
    const onScreen = [c('b', 20), c('rb', 50, 'b'), c('a', 10), c('ra', 55, 'a')];
    const fresh = [c('c', 30), c('b', 20), c('rb', 50, 'b'), c('rb2', 58, 'b')];
    expect(mergeThreadPage(onScreen, fresh).map(x => x.id)).toEqual(['c', 'b', 'rb', 'rb2', 'a', 'ra']);
  });
  it('a reply that is newer than the cutoff still belongs to an older thread', () => {
    const onScreen = [c('a', 10), c('ra', 59, 'a')];
    const fresh = [c('b', 20)];
    expect(mergeThreadPage(onScreen, fresh).map(x => x.id)).toEqual(['b', 'a', 'ra']);
  });
  it('keeps comments still being sent, and empties when the thread list is empty', () => {
    expect(mergeThreadPage([c('tmp', 59, 'a', { pending: true }), c('a', 10)], [c('a', 10)]).map(x => x.id)).toEqual(['a', 'tmp']);
    expect(mergeThreadPage([c('a', 10)], [])).toEqual([]);
  });
});
