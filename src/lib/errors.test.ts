import { describe, expect, it } from 'bun:test';
import { OFFLINE_MESSAGE, TIMEOUT_MESSAGE, TimeoutError, friendlyError, withTimeout } from './errors';

describe('friendlyError', () => {
  it('turns connection failures into one offline message', () => {
    expect(friendlyError(new TypeError('Failed to fetch'), 'x')).toBe(OFFLINE_MESSAGE);
    expect(friendlyError({ message: 'TypeError: Failed to fetch', code: '' }, 'x')).toBe(OFFLINE_MESSAGE);
    expect(friendlyError(new TypeError('Load failed'), 'x')).toBe(OFFLINE_MESSAGE);
  });
  it('passes through the readable refusals our database guards write', () => {
    expect(friendlyError({ code: '42501', message: 'Only the text of a post can be edited' }, 'x')).toBe('Only the text of a post can be edited');
    expect(friendlyError({ code: '23505', message: 'You already have a membership request waiting for review' }, 'x')).toBe('You already have a membership request waiting for review');
  });
  it('hides internals behind the caller\'s own wording', () => {
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "posts"' }, 'Could not post.')).toBe('Could not post.');
    expect(friendlyError({ code: 'PGRST301', message: 'JWT expired' }, 'Could not load.')).toBe('Could not load.');
    expect(friendlyError(new Error('boom'), 'Could not load.')).toBe('Could not load.');
  });
  it('explains a timeout', () => {
    expect(friendlyError(new TimeoutError(), 'x')).toBe(TIMEOUT_MESSAGE);
  });
});

describe('withTimeout', () => {
  it('resolves in time', async () => {
    expect(await withTimeout(Promise.resolve(3), 50)).toBe(3);
  });
  it('rejects with a TimeoutError when too slow', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('timed out');
  });
});
