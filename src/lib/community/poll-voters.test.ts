import { describe, expect, it, mock } from 'bun:test';
import type { VoteRow } from './poll-voters';

/** The request as the client sends it: recorded, and answered with what the database would return. */
const asked: unknown[][] = [];
let answer: { data: unknown; error: unknown } = { data: [], error: null };
const builder: Record<string, (...args: unknown[]) => unknown> = {};
for (const step of ['select', 'eq', 'order', 'limit']) builder[step] = (...args: unknown[]) => { asked.push([step, ...args]); return step === 'limit' ? Promise.resolve(answer) : builder; };
mock.module('../supabase', () => ({ supabase: { from: (table: string) => { asked.push(['from', table]); return builder; } } }));
const { fetchPollVoters, groupVoters } = await import('./poll-voters');

const row = (option: string, id: string, name: string | null, created: string, updated = created): VoteRow =>
  ({ option_id: option, created_at: created, updated_at: updated, voter: { id, full_name: name } });

describe('who voted for what', () => {
  it('groups votes by option, newest choice first, and says when a vote was moved', () => {
    const grouped = groupVoters([
      row('a', 'u1', 'Priya Sharma', '2026-10-04T10:00:00Z'),
      row('b', 'u2', 'Rahul Verma', '2026-10-04T10:01:00Z'),
      row('a', 'u3', 'Asha Rao', '2026-10-04T09:00:00Z', '2026-10-04T10:05:00Z'),
      row('a', 'u4', '  ', '2026-10-04T10:02:00Z', '2026-10-04T10:02:01Z'),
    ]);
    expect(grouped.get('a')!.map(v => [v.name, v.changed])).toEqual([
      ['Asha Rao', true], ['Unnamed member', false], ['Priya Sharma', false],
    ]);
    expect(grouped.get('b')!.map(v => v.voterId)).toEqual(['u2']);
    expect(grouped.get('c')).toBeUndefined();
  });

  it('a vote whose voter the database did not return (not readable) is left out, never shown nameless', () => {
    expect(groupVoters([{ option_id: 'a', created_at: 'x', updated_at: 'x', voter: null }]).size).toBe(0);
  });
});

describe('the request', () => {
  it('reads poll_votes for that poll with each voter\'s name — the database decides whose rows come back', async () => {
    asked.length = 0;
    answer = { data: [row('a', 'u1', 'Priya Sharma', '2026-10-04T10:00:00Z')], error: null };
    const grouped = await fetchPollVoters('poll-1');
    expect(asked).toEqual([
      ['from', 'poll_votes'],
      ['select', 'option_id, created_at, updated_at, voter:profiles!voter_id(id, full_name)'],
      ['eq', 'post_id', 'poll-1'],
      ['order', 'updated_at', { ascending: false }],
      ['limit', 2000],
    ]);
    expect(grouped!.get('a')![0].name).toBe('Priya Sharma');
  });

  it('a failed read is reported as failed, not as "no votes"', async () => {
    answer = { data: null, error: { message: 'offline' } };
    const quiet = console.error; console.error = () => {};
    try { expect(await fetchPollVoters('poll-1')).toBeNull(); } finally { console.error = quiet; }
  });
});
