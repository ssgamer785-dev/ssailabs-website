import { describe, expect, test } from 'bun:test';
import { resolveAuthorName } from './author-name';

/**
 * The exact bug this covers: an author's own anonymously-posted post kept
 * showing "Unknown User" to the author themselves after they turned their
 * name-visibility toggle on, because both call sites displayed the database's
 * frozen display_name snapshot even in the "it's your own post, revealed"
 * branch, instead of the viewer's own current name.
 */

const BASE = {
  official: false,
  isAdminViewer: false,
  isMine: false,
  reveal: false,
  isAnonymous: false,
  authorName: 'Snapshot Name',
  myName: 'My Current Name',
};

describe('resolveAuthorName: official is always the platform', () => {
  test('regardless of any other flag', () => {
    expect(resolveAuthorName({ ...BASE, official: true, isMine: true, reveal: true, isAnonymous: true }))
      .toBe('The Traders Planet');
  });
});

describe('resolveAuthorName: your own post', () => {
  test('THE BUG — anonymous post, reveal now on: shows your current name, not "Unknown User"', () => {
    expect(resolveAuthorName({ ...BASE, isMine: true, reveal: true, isAnonymous: true }))
      .toBe('My Current Name');
  });

  test('posted revealed, reveal still on: your current name (may differ from the frozen snapshot)', () => {
    expect(resolveAuthorName({ ...BASE, isMine: true, reveal: true, isAnonymous: false }))
      .toBe('My Current Name');
  });

  test('your own post, reveal currently OFF: masked, even if it was posted non-anonymous', () => {
    // isAnonymous is the post's frozen flag; !isAnonymous alone would reveal it
    // to anyone, but for the AUTHOR specifically the current toggle governs —
    // matching the existing "You · posting anonymously" / "You · name visible"
    // subtitle, which is also driven by the live toggle, not the snapshot.
    expect(resolveAuthorName({ ...BASE, isMine: true, reveal: false, isAnonymous: true }))
      .toBe('Unknown User');
  });
});

describe('resolveAuthorName: someone else\'s post', () => {
  test('not anonymous: the snapshot name, regardless of the viewer\'s own reveal toggle', () => {
    expect(resolveAuthorName({ ...BASE, isMine: false, isAnonymous: false, reveal: false }))
      .toBe('Snapshot Name');
    expect(resolveAuthorName({ ...BASE, isMine: false, isAnonymous: false, reveal: true }))
      .toBe('Snapshot Name');
  });

  test('anonymous: masked, regardless of the viewer\'s own reveal toggle', () => {
    expect(resolveAuthorName({ ...BASE, isMine: false, isAnonymous: true, reveal: true }))
      .toBe('Unknown User');
  });
});

describe('resolveAuthorName: admin viewer', () => {
  test('always sees the live real name — even on someone else\'s anonymous post', () => {
    expect(resolveAuthorName({ ...BASE, isAdminViewer: true, isMine: false, isAnonymous: true }))
      .toBe('Snapshot Name');
  });

  test('an admin\'s OWN post uses the snapshot too — never myName, so it can never drift from posts_feed/post_by_id', () => {
    // The server already resolves the live real name into authorName for an
    // admin viewer regardless of anonymity; overriding with myName here would
    // just be a longer path to the same value today, and a real bug the day
    // it is not (e.g. the admin's own name changed since this snapshot).
    expect(resolveAuthorName({ ...BASE, isAdminViewer: true, isMine: true, reveal: true, isAnonymous: true, authorName: 'The Admin' }))
      .toBe('The Admin');
  });
});
