/**
 * Where support mail goes.
 *
 * This is the address server.ts already falls back to for owner notifications,
 * lifted into one constant so the Help & Support screen and the server cannot
 * drift apart. OWNER_EMAIL still overrides it on the server; the browser bundle
 * has no access to server environment variables, so the client always shows
 * this address — if the owner sets OWNER_EMAIL to something else, this constant
 * is the one line to change with it.
 */
export const SUPPORT_EMAIL = 'contact.ssailabs@gmail.com';

/** A mailto: with the subject filled in, so support mail arrives pre-labelled. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
