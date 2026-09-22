/**
 * Where a membership request is handed off to the Trading Owner.
 *
 * International format: country code then the number, digits only. No leading
 * +, no spaces, no dashes — wa.me accepts nothing else, and given anything
 * else it opens a broken chat rather than erroring, so hasOwnerWhatsApp()
 * below checks the shape instead of trusting it.
 *
 * 91 is India. If this ever needs to change it is the only line to touch; the
 * form degrades to storing the request and showing the confirmation, without
 * the WhatsApp step, whenever it does not parse.
 */
export const OWNER_WHATSAPP_NUMBER = '919876970555';

/** Whether the WhatsApp hand-off is configured at all. */
export function hasOwnerWhatsApp(): boolean {
  return /^[1-9]\d{7,14}$/.test(OWNER_WHATSAPP_NUMBER);
}

export interface MembershipMessageFields {
  name: string;
  email: string;
  mobile: string;
  tradingExperience: string;
  address: string;
}

/**
 * Builds the Click-to-Chat URL with the whole request pre-filled.
 *
 * This opens WhatsApp with a drafted message. It does not send anything — the
 * person still presses Send themselves, which is the only thing Click-to-Chat
 * can do and the only thing the UI should claim.
 *
 * encodeURIComponent, not a template: the address and experience fields are
 * free text and will contain newlines, ampersands and '#', each of which would
 * otherwise truncate the message at that character.
 */
export function ownerWhatsAppUrl(f: MembershipMessageFields): string | null {
  if (!hasOwnerWhatsApp()) return null;

  const message = [
    'New membership request — The Traders Planet',
    '',
    `Name: ${f.name}`,
    `Email: ${f.email}`,
    `Mobile: ${f.mobile}`,
    `Trading experience: ${f.tradingExperience}`,
    `Address: ${f.address}`,
  ].join('\n');

  return `https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
