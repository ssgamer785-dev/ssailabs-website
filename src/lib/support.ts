import { OWNER_WHATSAPP_NUMBER, hasOwnerWhatsApp } from './owner-contact';

/**
 * Where support goes.
 *
 * Two channels, for two different things:
 *
 *  - WhatsApp is the support channel a member uses. It is the same number the
 *    membership hand-off already opens (one constant, in owner-contact.ts, so
 *    the two can never drift), and it is what Help & Support offers.
 *  - The email address is the one server.ts falls back to for owner
 *    notifications, and it is the address the Terms and Privacy screens name
 *    for legal and data-protection requests. Those have to stay written down
 *    and answerable in writing, which a chat thread is not, so the address
 *    stays even though Help & Support no longer routes to it.
 *
 * OWNER_EMAIL still overrides the address on the server; the browser bundle has
 * no access to server environment variables, so the client always shows this
 * constant — if the owner sets OWNER_EMAIL to something else, this is the one
 * line to change with it.
 */
export const SUPPORT_EMAIL = 'contact.ssailabs@gmail.com';

/** A mailto: with the subject filled in, so support mail arrives pre-labelled. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Whether the WhatsApp support route is configured at all. */
export const hasSupportWhatsApp = hasOwnerWhatsApp;

/**
 * The support number as a person reads it: +91 98769 70555.
 *
 * Derived from the same digits the link uses rather than written out a second
 * time — a label that disagrees with the link it sits under is worse than no
 * label, because it is the one the member writes down.
 */
export function supportWhatsAppDisplay(): string {
  const digits = OWNER_WHATSAPP_NUMBER;
  // Indian numbers are 91 + 10 digits, conventionally grouped 5 and 5. Any
  // other country code falls back to "+<digits>", which is always correct if
  // less pretty.
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/**
 * A wa.me link that opens WhatsApp with the first line already written.
 *
 * Click-to-Chat only drafts the message — the member still presses Send. The
 * UI must not claim otherwise.
 *
 * Returns null when the number is not configured, so the caller can drop the
 * option rather than render a link that opens a broken chat.
 */
export function supportWhatsAppUrl(intro: string): string | null {
  if (!hasOwnerWhatsApp()) return null;
  return `https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent(intro)}`;
}
