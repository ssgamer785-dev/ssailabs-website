import { beforeEach, describe, expect, it, mock } from 'bun:test';

/** Every rpc the client makes, answered with what the database would return. */
const calls: { fn: string; args: Record<string, unknown> }[] = [];
let answer: { data: unknown; error: { code?: string; message?: string } | null } = { data: 'post-1', error: null };
mock.module('../supabase', () => ({
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve(answer); } },
}));
const { createPollPost, pollImageProblem, POLL_IMAGE_MAX_BYTES } = await import('./polls');
const { barShare, participantLabel, voteLabel } = await import('./poll-format');

beforeEach(() => { calls.length = 0; answer = { data: 'post-1', error: null }; });

describe('poll results are counts, not percentages', () => {
  it('says how many people chose an option, with the right plural', () => {
    expect([0, 1, 2, 12].map(voteLabel)).toEqual(['0 votes', '1 vote', '2 votes', '12 votes']);
    expect([0, 1, 20].map(participantLabel)).toEqual(['0 participants', '1 participant', '20 participants']);
  });
  it('never prints a percent sign', () => {
    for (const n of [0, 1, 7, 100]) {
      expect(voteLabel(n)).not.toContain('%');
      expect(participantLabel(n)).not.toContain('%');
    }
  });
  it('sizes the bar by share, and draws nothing for a poll nobody has voted on', () => {
    expect(barShare(0, 0)).toBe(0);
    expect(barShare(12, 20)).toBe(60);
    expect(barShare(1, 3)).toBe(33.3);
    expect(barShare(3, 3)).toBe(100);
  });
});

describe('a poll picture', () => {
  it('accepts JPEG, PNG and WebP up to 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/PNG']) expect(pollImageProblem({ type, size: 1000 })).toBeNull();
    expect(pollImageProblem({ type: 'image/jpeg', size: POLL_IMAGE_MAX_BYTES })).toBeNull();
  });
  it('refuses other types, empty files and files over the limit, saying why', () => {
    expect(pollImageProblem({ type: 'image/gif', size: 1000 })).toContain('JPEG, PNG or WebP');
    expect(pollImageProblem({ type: 'image/heic', size: 1000 })).toContain('JPEG, PNG or WebP');
    expect(pollImageProblem({ type: 'application/pdf', size: 1000 })).toContain('JPEG, PNG or WebP');
    expect(pollImageProblem({ type: 'image/png', size: 0 })).toContain('empty');
    expect(pollImageProblem({ type: 'image/png', size: POLL_IMAGE_MAX_BYTES + 1 })).toContain('10 MB');
  });
});

describe('publishing a poll', () => {
  it('without a picture uses the existing create_poll_post, unchanged', async () => {
    const result = await createPollPost({ channel: 'students', question: 'Q?', options: ['a', 'b'], isAnonymous: true });
    expect(result).toEqual({ ok: true, postId: 'post-1' });
    expect(calls).toEqual([{ fn: 'create_poll_post', args: { p_channel: 'students', p_question: 'Q?', p_options: ['a', 'b'], p_is_anonymous: true } }]);
  });
  it('with a picture sends the poll and its uploaded picture in one call', async () => {
    await createPollPost({ channel: 'official', question: 'Q?', options: ['a', 'b'], image: { storageKey: 'posts/x/1-y.bin', width: 1200, height: 800 } });
    expect(calls).toEqual([{ fn: 'create_poll_post_with_image', args: {
      p_channel: 'official', p_question: 'Q?', p_options: ['a', 'b'], p_is_anonymous: false,
      p_image: { storage_key: 'posts/x/1-y.bin', width: 1200, height: 800 },
    } }]);
  });
  it('on a database without the picture function, says how to publish anyway', async () => {
    answer = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_poll_post_with_image' } };
    const result = await createPollPost({ channel: 'students', question: 'Q?', options: ['a', 'b'], image: { storageKey: 'k', width: null, height: null } });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Remove the picture');
  });
  it("passes the database's own words through for poll rules", async () => {
    answer = { data: null, error: { code: 'P0001', message: 'A poll needs at least two options' } };
    expect((await createPollPost({ channel: 'students', question: 'Q?', options: ['a'] })).message).toBe('A poll needs at least two options');
  });
});
