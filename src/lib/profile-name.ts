/**
 * Display-name rules, with no Supabase client in sight.
 *
 * Split out for the same reason activation-code.ts is split out of
 * activation.ts: src/lib/supabase.ts throws on import when the environment
 * variables are absent, so anything that imports it cannot be unit-tested. The
 * rules below are the only part of profile editing that decides anything on
 * the client, so they are the part worth being able to test directly.
 */

export const MAX_NAME_LENGTH = 60;
export const MIN_NAME_LENGTH = 2;

/**
 * Validates a display name the way the person will experience it, returning
 * the problem to show them or null when there is none.
 *
 * Trimmed before measuring, because a name made of spaces is an empty name.
 * Control characters are refused because a newline inside a name renders as a
 * broken row in every single-line place a name is drawn — the chat list, the
 * admin inbox, a post byline.
 */
export function validateFullName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < MIN_NAME_LENGTH) return 'Please enter your name.';
  if (name.length > MAX_NAME_LENGTH) return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return 'Names cannot contain line breaks.';
  }
  return null;
}
