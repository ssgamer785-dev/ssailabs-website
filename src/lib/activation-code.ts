/**
 * Activation-code presentation. Deliberately free of any import that touches
 * the network or the Supabase client, so it can be unit-tested on its own and
 * so a screen that only needs to format a field does not pull a client in.
 */

/**
 * Formats what the user types as TP-XXXX-XXXX while they type it.
 *
 * Presentation only. The database normalises anyway — normalise_activation_code()
 * strips everything that is not alphanumeric and upper-cases the rest — so this
 * exists to make the field look like the code on the person's screen, not to
 * validate. It must never drop a character the database would have kept.
 */
export function formatCodeInput(raw: string): string {
  const body = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^TP/, '').slice(0, 8);
  if (!body) return '';
  return body.length <= 4 ? `TP-${body}` : `TP-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** The code's own alphabet: 32 characters, with I, O, 0 and 1 left out. */
export const CODE_ALPHABET = /^[A-HJ-NP-Z2-9]*$/;
