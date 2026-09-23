import { useCallback, useEffect, useState } from 'react';
import { css } from '../../lib/css';
import { Hoverable } from '../../lib/Hoverable';
import { castPollVote, fetchPollResults, type PollOption } from '../../lib/community/polls';

/**
 * A poll attached to a post.
 *
 * Results are shown to everyone, before and after voting. The alternative —
 * hiding the counts until you have voted — is common, but it makes the bar a
 * reward for participating rather than information, and on a trading-education
 * feed the distribution is the point of asking.
 *
 * Voting is optimistic in both directions: the tapped option gains a vote and,
 * when the person is changing their mind, the previously chosen one loses it.
 * Doing only the first would show a total that briefly exceeds the number of
 * people who voted, which is the sort of wrong number that makes a reader stop
 * trusting the rest of the screen.
 */

function percent(votes: number, total: number): number {
  return total === 0 ? 0 : Math.round((votes / total) * 100);
}

export function PollCard({ postId }: { postId: string }) {
  const [options, setOptions] = useState<PollOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchPollResults(postId);
    if (rows) { setOptions(rows); setFailed(false); } else { setFailed(true); }
    setLoading(false);
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  const vote = useCallback(async (optionId: string) => {
    if (busy || !options) return;
    const already = options.find(o => o.isMyVote);
    if (already?.optionId === optionId) return;

    setBusy(true);
    setError(null);
    const previous = options;
    setOptions(prev => prev?.map(o => ({
      ...o,
      isMyVote: o.optionId === optionId,
      voteCount:
        o.optionId === optionId ? o.voteCount + 1
        : o.optionId === already?.optionId ? Math.max(0, o.voteCount - 1)
        : o.voteCount,
    })) ?? null);

    const result = await castPollVote(postId, optionId);
    setBusy(false);
    if (!result.ok) {
      setOptions(previous);
      setError(result.message ?? 'Could not record your vote.');
      return;
    }
    // Re-read: other people have been voting while this one was in flight, and
    // the optimistic numbers only moved by our own vote.
    void load();
  }, [busy, options, postId, load]);

  if (loading) {
    return (
      <div style={css('padding:14px;border-radius:13px;background:var(--surface-inset);font-size:12.5px;color:var(--text-faint)')}>
        Loading poll…
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" style={css('padding:14px;border-radius:13px;background:var(--danger-soft);display:flex;flex-direction:column;gap:9px;align-items:flex-start')}>
        <div style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.5')}>
          Couldn&rsquo;t load this poll. The results exist &mdash; this is a loading problem.
        </div>
        <Hoverable
          onClick={() => { setLoading(true); void load(); }}
          className="pressable"
          style={css('height:32px;padding:0 13px;border-radius:9px;border:1px solid var(--danger-border);display:flex;align-items:center;font-size:12px;font-weight:700;color:var(--danger-ink);cursor:pointer')}
          hoverStyle={css('background:var(--danger-soft)')}
        >
          Try again
        </Hoverable>
      </div>
    );
  }

  if (!options?.length) {
    return (
      <div style={css('padding:14px;border-radius:13px;background:var(--surface-inset);font-size:12.5px;color:var(--text-faint)')}>
        This poll has no options.
      </div>
    );
  }

  const total = options.reduce((n, o) => n + o.voteCount, 0);
  const voted = options.some(o => o.isMyVote);

  return (
    <div style={css('display:flex;flex-direction:column;gap:8px')}>
      {options.map(o => {
        const share = percent(o.voteCount, total);
        return (
          <Hoverable
            key={o.optionId}
            onClick={() => void vote(o.optionId)}
            role="button"
            aria-pressed={o.isMyVote}
            aria-label={`${o.label} — ${o.voteCount} vote${o.voteCount === 1 ? '' : 's'}, ${share}%`}
            className="pressable"
            style={{
              ...css('position:relative;width:100%;min-height:44px;border-radius:11px;overflow:hidden;' +
                     'display:flex;align-items:center;padding:0 13px;gap:10px;cursor:pointer'),
              background: 'var(--surface-inset)',
              border: `1px solid ${o.isMyVote ? 'var(--accent-border)' : 'var(--border-4)'}`,
              opacity: busy ? 0.75 : 1,
            }}
            hoverStyle={css('border-color:var(--border-strong)')}
          >
            {/* The filled bar sits behind the text rather than beside it, so a
                long option is never squeezed by its own result. */}
            <div
              aria-hidden="true"
              style={{
                ...css('position:absolute;left:0;top:0;bottom:0;transition:width 260ms var(--ease-out)'),
                width: `${share}%`,
                background: o.isMyVote ? 'var(--accent-tint)' : 'var(--neutral-fill)',
                opacity: o.isMyVote ? 1 : 0.55,
              }}
            />
            <div style={css('position:relative;flex:1;min-width:0;font-size:13px;font-weight:600;letter-spacing:-.1px;line-height:1.35;text-wrap:pretty;padding:11px 0')}>
              {o.label}
            </div>
            {o.isMyVote && (
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css('position:relative;flex:none')}>
                <circle cx="12" cy="12" r="9.5" fill="var(--accent-ink)" />
                <path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="var(--on-accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <div style={{
              ...css('position:relative;flex:none;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap'),
              color: o.isMyVote ? 'var(--accent-ink)' : 'var(--text-muted)',
            }}>
              {share}%
            </div>
          </Hoverable>
        );
      })}

      <div style={css('display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--text-faint)')}>
        <span>{total} {total === 1 ? 'vote' : 'votes'}</span>
        <span aria-hidden="true">·</span>
        <span>{voted ? 'Tap another option to change your vote' : 'Tap to vote'}</span>
      </div>

      {error && (
        <div role="alert" style={css('font-size:12px;color:var(--danger-ink);line-height:1.45')}>{error}</div>
      )}
    </div>
  );
}
