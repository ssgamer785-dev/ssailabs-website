import { describe, expect, it } from 'bun:test';
import { isWithheldForAnonymity } from './media-visibility';

const base = { attachment: 'image' as const, isAnonymous: true, isMine: false, storageKey: null, mediaPurged: false };

describe('media withheld to keep an author anonymous', () => {
  it('applies to another member\'s anonymous post whose media key was withheld', () => {
    for (const attachment of ['image', 'video', 'pdf', 'file', 'voice'] as const) expect(isWithheldForAnonymity({ ...base, attachment })).toBe(true);
  });
  it('never applies to polls, text posts, named posts, the author\'s own post, purged media, or a post with its key', () => {
    expect(isWithheldForAnonymity({ ...base, attachment: 'poll' as never })).toBe(false);
    expect(isWithheldForAnonymity({ ...base, attachment: 'none' })).toBe(false);
    expect(isWithheldForAnonymity({ ...base, isAnonymous: false })).toBe(false);
    expect(isWithheldForAnonymity({ ...base, isMine: true })).toBe(false);
    expect(isWithheldForAnonymity({ ...base, mediaPurged: true })).toBe(false);
    expect(isWithheldForAnonymity({ ...base, storageKey: 'posts/x/1-y.bin' as never })).toBe(false);
  });
});
