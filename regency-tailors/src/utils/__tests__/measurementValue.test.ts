import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stepMeasurementValue,
  hasLetters,
  measurementUnitSuffix,
  measurementWithUnit
} from '../measurementValue';
import { measurementInputProps } from '../measurementFocus';

/**
 * Measurements are free text: 38, 40 L, 15.5 R, 38 Tight, XL.
 *
 * What these protect is the rule that a value is never turned into a number
 * and never loses its letters. parseFloat("40 L") is 40, so any path that
 * round-trips a measurement through it quietly changes what the tailor wrote.
 */

describe('the ±¼ stepper keeps what the tailor wrote', () => {
  it('steps a plain number exactly as it always has', () => {
    expect(stepMeasurementValue('40', 0.25)).toBe('40.25');
    expect(stepMeasurementValue('40.25', 0.25)).toBe('40.5');
    expect(stepMeasurementValue('15.5', -0.25)).toBe('15.25');
    expect(stepMeasurementValue('38', -0.25)).toBe('37.75');
    expect(stepMeasurementValue(40, 0.25)).toBe('40.25');
  });

  it('treats an empty box as zero, as before', () => {
    expect(stepMeasurementValue('', 0.25)).toBe('0.25');
    expect(stepMeasurementValue(undefined, 0.25)).toBe('0.25');
    expect(stepMeasurementValue(null, -0.25)).toBe('0');
  });

  it('never goes below zero', () => {
    expect(stepMeasurementValue('0.25', -0.25)).toBe('0');
    expect(stepMeasurementValue('0', -0.25)).toBe('0');
  });

  it('keeps a letter suffix exactly as typed', () => {
    expect(stepMeasurementValue('40 L', 0.25)).toBe('40.25 L');
    expect(stepMeasurementValue('15.5 R', 0.25)).toBe('15.75 R');
    expect(stepMeasurementValue('15.5R', -0.25)).toBe('15.25R');
    expect(stepMeasurementValue('38 Tight', 0.25)).toBe('38.25 Tight');
    expect(stepMeasurementValue('38 Extra Tight', -0.25)).toBe('37.75 Extra Tight');
  });

  it('keeps a suffix written in another script', () => {
    expect(stepMeasurementValue('40 ਲੰਬਾ', 0.25)).toBe('40.25 ਲੰਬਾ');
    expect(stepMeasurementValue('40 लंबा', 0.25)).toBe('40.25 लंबा');
  });

  it('leaves text it cannot do arithmetic on completely alone', () => {
    for (const v of ['XL', 'L 40', 'Regular', '15 1/2', '40-42', '38/40', 'N/A']) {
      expect(stepMeasurementValue(v, 0.25), v).toBe(v);
      expect(stepMeasurementValue(v, -0.25), v).toBe(v);
    }
  });

  it('never invents a number out of letters', () => {
    expect(stepMeasurementValue('XL', 0.25)).not.toMatch(/^\d/);
  });
});

describe('letters are detected in any script', () => {
  it('finds them', () => {
    expect(hasLetters('XL')).toBe(true);
    expect(hasLetters('40 L')).toBe(true);
    expect(hasLetters('ਲੰਬਾ')).toBe(true);
  });
  it('does not mistake numbers, fractions or the dash for letters', () => {
    for (const v of ['40', '15.5', '15 1/2', '—', '', undefined, null, 0]) {
      expect(hasLetters(v), String(v)).toBe(false);
    }
  });
});

describe('the unit mark is only for numbers', () => {
  it('marks a number as before', () => {
    expect(measurementWithUnit('38', '38', 'inches')).toBe('38 "');
    expect(measurementWithUnit('38', 38, 'cm')).toBe('38 cm');
    expect(measurementWithUnit('38', '38', undefined)).toBe('38 "');
  });
  it('prints a value with letters exactly as written', () => {
    expect(measurementWithUnit('XL', 'XL', 'inches')).toBe('XL');
    expect(measurementWithUnit('40 L', '40 L', 'inches')).toBe('40 L');
    expect(measurementWithUnit('38 Tight', '38 Tight', 'cm')).toBe('38 Tight');
    expect(measurementUnitSuffix('XL', 'inches')).toBe('');
  });
  it('prints an unrecorded dash as it always has', () => {
    expect(measurementWithUnit('—', undefined, 'inches')).toBe('— "');
  });
});

describe('every measurement input is free text', () => {
  it('is a text input, with a text keyboard', () => {
    expect(measurementInputProps.type).toBe('text');
    // "decimal" and "numeric" show a digits-only keypad on an iPad, which makes
    // a letter impossible to type however permissive the handler is.
    expect(measurementInputProps.inputMode).toBe('text');
  });
  it('does not let the device rewrite what was typed', () => {
    expect(measurementInputProps.autoCorrect).toBe('off');
    expect(measurementInputProps.autoCapitalize).toBe('off');
    expect(measurementInputProps.spellCheck).toBe(false);
  });
  it('carries nothing that would restrict the characters', () => {
    const keys = Object.keys(measurementInputProps);
    for (const banned of ['pattern', 'step', 'min', 'max', 'maxLength']) {
      expect(keys).not.toContain(banned);
    }
  });
  it('is still the Enter-run marker', () => {
    expect((measurementInputProps as Record<string, unknown>)['data-measurement-input']).toBe('true');
  });
});

/* ------------------------------------------------------------ source guards */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** Source with comments removed, so a comment explaining the old bug is not the bug. */
const code = (rel: string): string =>
  readFileSync(resolve(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ENTRY_FILES = [
  'src/components/modals/OrderModal.tsx',
  'src/components/modals/MeasurementModal.tsx',
  'src/components/measurements/MeasurementSectionInputs.tsx'
];

describe('no numeric restriction can creep back in', () => {
  for (const file of ENTRY_FILES) {
    it(`${file} has no number input and no numeric keypad`, () => {
      const src = code(file);
      expect(src).not.toMatch(/type=["']number["']/);
      expect(src).not.toMatch(/inputMode=["'](decimal|numeric)["']/);
    });
  }

  it('neither entry modal coerces a measurement with parseFloat', () => {
    expect(code('src/components/modals/OrderModal.tsx')).not.toMatch(/parseFloat/);
    expect(code('src/components/modals/MeasurementModal.tsx')).not.toMatch(/parseFloat/);
  });

  it('the Measurement Entry modal no longer writes the lossy jacket/trouser shadow', () => {
    const src = code('src/components/modals/MeasurementModal.tsx');
    // It re-derived coat/pant through parseFloat and invented a number for
    // every empty box (chest 40, waist 36, neck 16.5, knee 18).
    expect(src).not.toMatch(/\bjacket:\s*selectedGarments/);
    expect(src).not.toMatch(/\btrouser:\s*selectedGarments/);
  });

  it('both steppers go through the shared, letter-preserving one', () => {
    expect(code('src/components/modals/OrderModal.tsx')).toContain('stepMeasurementValue(');
    expect(code('src/components/modals/MeasurementModal.tsx')).toContain('stepMeasurementValue(');
  });

  it('both detail screens decide the unit mark through the shared rule', () => {
    expect(code('src/components/measurements/MeasurementSheetBlocks.tsx')).toContain('measurementWithUnit(');
    expect(code('src/components/measurements/MeasurementDetailBlocks.tsx')).toContain('measurementWithUnit(');
  });
});
