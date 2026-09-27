import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let refreshes = 0;
mock.module('./supabase', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: { access_token: 'token-1' } } }),
    refreshSession: async () => { refreshes += 1; return { data: { session: { access_token: 'token-2' } }, error: null }; },
  } },
}));

const { NoAvatarError, forgetAvatarUrl, getAvatarUrl } = await import('./profile-api');

const saved = globalThis.fetch;
let requests: string[];
let answer: () => Response;
let tokens: string[] = [];
beforeEach(() => {
  requests = [];
  refreshes = 0;
  tokens = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push(url);
    tokens.push(String((init?.headers as Record<string, string> | undefined)?.Authorization ?? 'none'));
    return answer();
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = saved; });

const noPicture = () => new Response(JSON.stringify({ error: 'Profile picture not found.' }), { status: 404 });
const picture = () => new Response(JSON.stringify({ url: 'https://r2.example/signed', expiresIn: 3600 }), { status: 200 });

describe('avatar URL cache', () => {
  it('asks once for a member with no picture; later mounts reuse the answer (Production logged a 404 per mount)', async () => {
    answer = noPicture;
    await expect(getAvatarUrl(null, 'member-without-photo')).rejects.toBeInstanceOf(NoAvatarError);
    await expect(getAvatarUrl(null, 'member-without-photo')).rejects.toBeInstanceOf(NoAvatarError);
    await expect(getAvatarUrl(null, 'member-without-photo')).rejects.toBeInstanceOf(NoAvatarError);
    expect(requests).toEqual(['/api/profile/avatar-url?userId=member-without-photo']);
  });

  it('shares one request between avatars mounting together', async () => {
    answer = picture;
    const urls = await Promise.all([getAvatarUrl(null, 'admin-id'), getAvatarUrl(null, 'admin-id'), getAvatarUrl(null, 'admin-id')]);
    expect(urls).toEqual(['https://r2.example/signed', 'https://r2.example/signed', 'https://r2.example/signed']);
    expect(await getAvatarUrl(null, 'admin-id')).toBe('https://r2.example/signed');
    expect(requests).toHaveLength(1);
  });

  it('retries a temporary failure instead of remembering it as "no picture"', async () => {
    answer = () => new Response('{}', { status: 503 });
    await expect(getAvatarUrl(null, 'student-id')).rejects.not.toBeInstanceOf(NoAvatarError);
    answer = picture;
    expect(await getAvatarUrl(null, 'student-id')).toBe('https://r2.example/signed');
    expect(requests).toHaveLength(2);
  });

  it('forgets "no picture" when the member sets one, so it shows immediately', async () => {
    answer = noPicture;
    await expect(getAvatarUrl(null, 'me')).rejects.toBeInstanceOf(NoAvatarError);
    forgetAvatarUrl(null, 'me');                    // PersonalInformationScreen after an upload
    answer = picture;
    expect(await getAvatarUrl(null, 'me')).toBe('https://r2.example/signed');
    expect(requests).toHaveLength(2);
  });

  it('never sends an avatar request without a session token', async () => {
    answer = picture;
    await getAvatarUrl(null, 'token-check');
    expect(tokens).toEqual(['Bearer token-1']);
  });

  it('after a rejected token: refreshes the session once and retries once', async () => {
    const replies = [new Response('{}', { status: 401 }), picture()];
    answer = () => replies.shift()!;
    expect(await getAvatarUrl(null, 'stale-session')).toBe('https://r2.example/signed');
    expect(refreshes).toBe(1);
    expect(tokens).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('a session that stays rejected fails without a loop and is not cached as "no picture"', async () => {
    answer = () => new Response('{}', { status: 401 });
    await expect(getAvatarUrl(null, 'signed-out')).rejects.not.toBeInstanceOf(NoAvatarError);
    expect(requests).toHaveLength(2);                // original + one retry, then stop
    expect(refreshes).toBe(1);
    await expect(getAvatarUrl(null, 'signed-out')).rejects.toThrow();
    expect(requests).toHaveLength(4);                // asked again next time, not remembered as absent
  });
});
