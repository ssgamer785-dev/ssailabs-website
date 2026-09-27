import { describe, expect, test } from 'bun:test';
import { resolveAuthorName } from './author-name';

/**
 * The author is shown the truth about their own post: what every other member
 * sees. The earlier rule followed the author's current "post with my real
 * name" preference instead, which told authors their post was anonymous while
 * others saw their name (TP-009).
 */
const BASE = {
  official: false,
  isAdminViewer: false,
  isMine: false,
  isAnonymous: false,
  authorName: 'Snapshot Name',
  myName: 'My Current Name',
};

describe('resolveAuthorName: official is always the platform', () => {
  test('regardless of any other flag', () => {
    expect(resolveAuthorName({ ...BASE, official: true, isMine: true, isAnonymous: true })).toBe('The Traders Planet');
  });
});

describe('resolveAuthorName: your own post shows what others see', () => {
  test('a named post: your current name (it may differ from the frozen snapshot)', () => {
    expect(resolveAuthorName({ ...BASE, isMine: true, isAnonymous: false })).toBe('My Current Name');
  });
  test('an anonymous post: Unknown User, exactly as other members see it', () => {
    expect(resolveAuthorName({ ...BASE, isMine: true, isAnonymous: true })).toBe('Unknown User');
  });
});

describe("resolveAuthorName: someone else's post", () => {
  test('not anonymous: the snapshot name', () => {
    expect(resolveAuthorName({ ...BASE, isAnonymous: false })).toBe('Snapshot Name');
  });
  test('anonymous: masked', () => {
    expect(resolveAuthorName({ ...BASE, isAnonymous: true })).toBe('Unknown User');
  });
});

describe('resolveAuthorName: admin viewer', () => {
  test('always sees the live real name — even on someone else\'s anonymous post', () => {
    expect(resolveAuthorName({ ...BASE, isAdminViewer: true, isAnonymous: true })).toBe('Snapshot Name');
  });
  test("an admin's own post uses the server-resolved name", () => {
    expect(resolveAuthorName({ ...BASE, isAdminViewer: true, isMine: true, isAnonymous: true, authorName: 'The Admin' })).toBe('The Admin');
  });
});
