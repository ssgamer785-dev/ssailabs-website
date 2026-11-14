/** Formats a stored ISO timestamp in the viewer's local timezone. Invalid or
 * absent values stay empty; old content must never be presented as "now". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const dateParts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find(item => item.type === type)?.value ?? '';
  const localTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${part('day')} ${part('month')} ${part('year')}, ${localTime}`;
}
