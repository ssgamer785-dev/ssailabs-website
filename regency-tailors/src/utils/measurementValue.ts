/**
 * What a measurement value is allowed to be.
 *
 * Anything a tailor writes on a tape card: `38`, `40 L`, `15.5 R`, `38 Tight`,
 * `XL`, `15 1/2`. The box is free text and the stored value is exactly what
 * was typed. This module exists so that rule lives in one place — every place
 * that used to assume a measurement was a number goes through here instead of
 * calling `parseFloat` on it.
 *
 * The rule it protects: **a value is never converted to a number and never has
 * its letters dropped.** `parseFloat("40 L")` is `40`; any code path that
 * round-trips a measurement through it quietly turns what the tailor wrote
 * into something they did not.
 */

/**
 * A number, optionally followed by letters: `40`, `40.`, `.5`, `40 L`, `15.5R`,
 * `38 Tight`. Anything else (`XL`, `L 40`, `15 1/2`, `40-42`) is text the
 * steppers have no sensible arithmetic for.
 *
 * Unicode letters, not just A–Z: a counter hand may well write the suffix in
 * Gurmukhi or Devanagari, and that is as much a measurement as `L`.
 */
const NUMBER_THEN_LETTERS = /^\s*(\d+(?:\.\d*)?|\.\d+)(\s*\p{L}[\p{L}\p{M} .\-]*)?$/u;

/** Whether the value contains a letter in any script. */
export function hasLetters(value: unknown): boolean {
  return /\p{L}/u.test(value === undefined || value === null ? '' : String(value));
}

/** A number as the steppers have always written it: `15.5`, not `15.50`. */
function formatStepped(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The ±¼ stepper on a value that may carry letters.
 *
 *   ''         + ¼  →  '0.25'      (unchanged behaviour for an empty box)
 *   '40'       + ¼  →  '40.25'     (unchanged)
 *   '40 L'     + ¼  →  '40.25 L'   (the suffix is kept exactly as typed)
 *   '15.5 R'   − ¼  →  '15.25 R'
 *   'XL'       ± ¼  →  'XL'        (nothing to step; never rewritten)
 *   '15 1/2'   ± ¼  →  '15 1/2'    (a fraction is not a decimal we may guess at)
 *
 * It refuses rather than guesses: a stepper that "helpfully" reads `15 1/2` as
 * `15` would be silently losing half an inch, which is the failure this whole
 * module is here to prevent.
 */
export function stepMeasurementValue(current: unknown, delta: number): string {
  const text = current === undefined || current === null ? '' : String(current);

  if (text.trim() === '') return formatStepped(Math.max(0, delta));

  const match = NUMBER_THEN_LETTERS.exec(text);
  if (!match) return text;

  const stepped = Math.max(0, parseFloat(match[1]) + delta);
  return formatStepped(stepped) + (match[2] ?? '');
}

/**
 * The unit mark for a value, or nothing.
 *
 * `38"` says thirty-eight inches. `XL"` and `40 Tight"` say nothing true, so a
 * value that contains letters is shown as written, with no mark appended.
 * Numbers and the em dash for "not recorded" print exactly as they always have.
 */
export function measurementUnitSuffix(value: unknown, unit: 'inches' | 'cm' | string | undefined): string {
  if (hasLetters(value)) return '';
  return unit === 'cm' ? 'cm' : '"';
}

/** `value` followed by its unit mark when it has one, as the screens print it. */
export function measurementWithUnit(
  display: string,
  rawValue: unknown,
  unit: 'inches' | 'cm' | string | undefined
): string {
  const suffix = measurementUnitSuffix(rawValue, unit);
  return suffix ? `${display} ${suffix}` : display;
}
