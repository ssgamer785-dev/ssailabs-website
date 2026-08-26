import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readArray, readObject, writeJson, onStorageFailure } from '../safeStorage';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readArray', () => {
  it('returns stored records', () => {
    localStorage.setItem('K', JSON.stringify([{ id: '1' }]));
    expect(readArray('K', [])).toEqual([{ id: '1' }]);
  });

  it('falls back instead of throwing on corrupt JSON', () => {
    localStorage.setItem('K', '{"broken": ');
    expect(readArray('K', [{ id: 'fallback' }])).toEqual([{ id: 'fallback' }]);
  });

  it('quarantines the corrupt value so nothing is silently destroyed', () => {
    localStorage.setItem('K', '{"broken": ');
    readArray('K', []);
    expect(localStorage.getItem('K__corrupt')).toBe('{"broken": ');
  });

  it('falls back when the stored value is valid JSON but not a list', () => {
    localStorage.setItem('K', '{"a":1}');
    expect(readArray('K', [])).toEqual([]);
  });

  it('reports the failure to subscribers', () => {
    const seen: string[] = [];
    const off = onStorageFailure(f => seen.push(`${f.reason}:${f.key}`));
    localStorage.setItem('K', 'nope');
    readArray('K', []);
    off();
    expect(seen).toContain('read:K');
  });
});

describe('readObject', () => {
  it('merges stored values over the fallback', () => {
    localStorage.setItem('P', JSON.stringify({ name: 'Regency' }));
    expect(readObject('P', { name: 'x', city: 'Jalandhar' })).toEqual({ name: 'Regency', city: 'Jalandhar' });
  });

  it('falls back for an array payload', () => {
    localStorage.setItem('P', '[]');
    expect(readObject('P', { name: 'x' })).toEqual({ name: 'x' });
  });
});

describe('writeJson', () => {
  it('reports rather than throws when storage rejects the write', () => {
    const failures: string[] = [];
    const off = onStorageFailure(f => failures.push(f.message));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err: any = new Error('full');
      err.name = 'QuotaExceededError';
      throw err;
    });

    expect(() => writeJson('K', [1, 2, 3])).not.toThrow();
    expect(writeJson('K', [1, 2, 3])).toBe(false);
    expect(failures.some(m => m.includes('storage is full'))).toBe(true);

    spy.mockRestore();
    off();
  });

  it('returns true on success', () => {
    expect(writeJson('K', { a: 1 })).toBe(true);
    expect(localStorage.getItem('K')).toBe('{"a":1}');
  });
});
