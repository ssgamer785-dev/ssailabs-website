import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) } },
}));

const { NoAvatarError, forgetAvatarUrl, getAvatarUrl } = await import('./profile-api');

const saved = globalThis.fetch;
let requests: string[];
let answer: () => Response;
beforeEach(() => {
  requests = [];
  globalThis.fetch = (async (url: string) => { requests.push(url); return answer(); }) as typeof fetch;
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
});
