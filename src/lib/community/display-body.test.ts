import { describe, expect, it } from 'bun:test';
import { displayPostBody } from './display-body';

describe('displayPostBody', () => {
  it('removes the mirrored Official headline from the body', () => {
    expect(displayPostBody('Market update', 'Market update\nLevels are holding.'))
      .toBe('Levels are holding.');
  });

  it('removes only the matching first non-empty line and keeps the remaining text', () => {
    expect(displayPostBody('Market update', '\nMarket update\n\nLevels\nMore levels'))
      .toBe('Levels\nMore levels');
  });

  it('preserves body when title and opening line are distinct', () => {
    expect(displayPostBody('Market update', 'Levels are holding.'))
      .toBe('Levels are holding.');
  });

  it('preserves body when there is no title', () => {
    expect(displayPostBody(null, 'Student post text')).toBe('Student post text');
  });

  it('returns no body when the whole body only repeats the title', () => {
    expect(displayPostBody('Market update', 'Market update')).toBeNull();
  });
});
