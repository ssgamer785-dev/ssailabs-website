/** Normalizes common Indian input formats to +91 followed by ten digits. */
export function normalizeIndianMobile(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[\d+\s().-]+$/.test(trimmed)) return null;

  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+91')) digits = digits.slice(2);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export function validateIndianMobile(value: string): string | null {
  if (!value.trim()) return null;
  return normalizeIndianMobile(value) === null
    ? 'Enter a valid 10-digit Indian mobile number.'
    : null;
}
