import { describe, expect, it, mock } from 'bun:test';

mock.module('../supabase', () => ({ supabase: {} }));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: null }) }));
const { isMissingTable, mergePreferences } = await import('./usePreferences');
const { DEFAULT_PREFERENCES } = await import('./categories');

describe('saved preferences', () => {
  it('no row is the defaults', () => {
    expect(mergePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(mergePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });
  it('a saved row overrides only what it says', () => {
    const merged = mergePreferences({ likes: true, direct_messages: false });
    expect(merged.likes).toBe(true);
    expect(merged.direct_messages).toBe(false);
    expect(merged.comments).toBe(true);
    expect(merged.community_posts).toBe(false);
  });
  it('ignores anything that is not a boolean', () => {
    expect(mergePreferences({ likes: 'yes', system: 0, comments: null })).toEqual(DEFAULT_PREFERENCES);
  });
  it('does not change the defaults it was given', () => {
    mergePreferences({ likes: true });
    expect(DEFAULT_PREFERENCES.likes).toBe(false);
  });
  it('recognises a table the database does not have yet', () => {
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTable({ code: '42P01' })).toBe(true);
    expect(isMissingTable({ message: "Could not find the table 'public.notification_preferences' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: '500', message: 'boom' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
