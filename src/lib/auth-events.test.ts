import { describe, expect, it } from 'bun:test';
import { profileActionFor, stableUser } from './auth-events';

describe('profile handling across auth events', () => {
  it('returning to the app or refreshing a token never reloads the profile behind a loading screen', () => {
    expect(profileActionFor('SIGNED_IN', 'u1', 'u1')).toBe('refresh-silently');
    expect(profileActionFor('TOKEN_REFRESHED', 'u1', 'u1')).toBe('keep');
    expect(profileActionFor('USER_UPDATED', 'u1', 'u1')).toBe('refresh-silently');
    expect(profileActionFor('INITIAL_SESSION', 'u1', 'u1')).toBe('keep');
  });

  it('a first sign-in, a cold start or a different account loads the profile', () => {
    expect(profileActionFor('SIGNED_IN', 'u1', null)).toBe('load');
    expect(profileActionFor('INITIAL_SESSION', 'u1', undefined)).toBe('load');
    expect(profileActionFor('SIGNED_IN', 'u2', 'u1')).toBe('load');
  });

  it('signing out clears it', () => {
    expect(profileActionFor('SIGNED_OUT', null, 'u1')).toBe('clear');
  });
});

describe('stable user identity', () => {
  const a = { id: 'u1', email: 'a@x.test', updated_at: '2026-09-27T10:00:00Z' };
  it('keeps the same object for the same person', () => {
    expect(stableUser(a, { ...a })).toBe(a);
  });
  it('takes the new object when anything visible changed or the person changed', () => {
    const renamed = { ...a, email: 'b@x.test' };
    expect(stableUser(a, renamed)).toBe(renamed);
    const other = { ...a, id: 'u2' };
    expect(stableUser(a, other)).toBe(other);
    expect(stableUser(a, null)).toBeNull();
    expect(stableUser(null, a)).toBe(a);
  });
});
