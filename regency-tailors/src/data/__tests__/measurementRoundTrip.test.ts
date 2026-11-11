import { describe, it, expect } from 'vitest';
import { measurementValueRows, toMeasurementRecord, MEASUREMENT_CATEGORIES, MeasurementRow } from '../mappers';
import {
  MEASUREMENT_SECTIONS,
  sectionFields,
  garmentSections,
  garmentMeasurementBlocks,
  MeasurementSection
} from '../../utils/garmentMeasurements';
import { MeasurementRecord, OrderItem } from '../../types';

/**
 * What the tailor types is what comes back.
 *
 * The database stores a garment's measurements as one jsonb object, so a
 * string survives untouched — provided nothing in the app's own code path
 * coerces it. These drive every field of every garment through the same
 * functions the repository uses to write and to read, with the values a
 * counter hand really writes.
 */

const SAMPLES: (string | number)[] = [
  '38', '40 L', '15.5 R', '38 Tight', 'XL', 38, 15.5, '15 1/2', '40-42', 'ਲੰਬਾ', ' 38', '0', 0
];

/** A full section: every field the canonical definition has, mixed values. */
function filledSection(section: MeasurementSection, offset: number): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  sectionFields(section).forEach((f, i) => {
    out[f.key] = SAMPLES[(i + offset) % SAMPLES.length];
  });
  return out;
}

/** Pretend to be Postgres: write the rows, serialise as jsonb, read them back. */
function throughTheDatabase(record: Partial<MeasurementRecord>): MeasurementRecord {
  const rows = measurementValueRows(record).map((r, i) => ({
    id: `v-${i}`,
    measurement_id: 'm-1',
    garment_category: r.garment_category,
    // jsonb is JSON: this is exactly what survives a round trip through it.
    data: JSON.parse(JSON.stringify(r.data))
  }));
  const row: MeasurementRow = {
    id: 'm-1',
    customer_id: 'c-1',
    unit: 'inches',
    last_updated: '2026-09-23',
    measurement_values: rows as MeasurementRow['measurement_values']
  };
  return toMeasurementRecord(row, null);
}

describe('every garment, every field, comes back exactly as typed', () => {
  it('covers all eight sections', () => {
    expect(MEASUREMENT_SECTIONS.map(d => d.section).sort()).toEqual([...MEASUREMENT_CATEGORIES].sort());
  });

  MEASUREMENT_SECTIONS.forEach((def, i) => {
    it(`${def.section}: ${sectionFields(def.section).length} fields survive save and reload unchanged`, () => {
      const typed = filledSection(def.section, i);
      const loaded = throughTheDatabase({ [def.section]: typed } as Partial<MeasurementRecord>);
      const back = (loaded as unknown as Record<string, Record<string, unknown>>)[def.section];

      expect(back, `${def.section} was dropped on reload`).toBeDefined();
      expect(back).toStrictEqual(typed);
    });
  });

  it('keeps the TYPE of each value: a string stays a string and a number stays a number', () => {
    const loaded = throughTheDatabase({
      coat: { chest: '38', length: 38, sleeve: '40 L' }
    });
    expect(loaded.coat?.chest).toBe('38');
    expect(typeof loaded.coat?.chest).toBe('string');
    expect(loaded.coat?.length).toBe(38);
    expect(typeof loaded.coat?.length).toBe('number');
    expect(loaded.coat?.sleeve).toBe('40 L');
  });

  it('does not trim, round, uppercase or truncate', () => {
    const loaded = throughTheDatabase({ shirt: { chest: ' 38 tight ', collar: 'xl', length: '15.50' } });
    expect(loaded.shirt?.chest).toBe(' 38 tight ');
    expect(loaded.shirt?.collar).toBe('xl');
    expect(loaded.shirt?.length).toBe('15.50');
  });

  it('keeps a recorded zero, a recorded 0 string, and the empty string', () => {
    const loaded = throughTheDatabase({ pant: { waist: 0, hip: '0', thigh: '' } });
    expect(loaded.pant?.waist).toBe(0);
    expect(loaded.pant?.hip).toBe('0');
    expect(loaded.pant?.thigh).toBe('');
  });
});

describe('the three garments the database used to forget', () => {
  // toMeasurementRecord listed all eight sections as "selected" but returned
  // only five of them, so a waistcoat, jacket or sherwani saved to Supabase
  // came back marked as measured and empty.
  const cases: [string, MeasurementSection, string][] = [
    ['Waistcoat', 'waistcoat', 'waistcoat'],
    ['Jacket', 'jacketGarment', 'jacketGarment'],
    ['Sherwani', 'sherwani', 'sherwani']
  ];

  cases.forEach(([label, section, key]) => {
    it(`${label} is returned with its values, not just named`, () => {
      const typed = filledSection(section, 3);
      const loaded = throughTheDatabase({ [key]: typed } as Partial<MeasurementRecord>);
      expect(loaded.selectedGarments).toContain(label);
      expect((loaded as unknown as Record<string, unknown>)[key]).toStrictEqual(typed);
    });
  });

  it('a record holding all eight sections returns all eight', () => {
    const everything = Object.fromEntries(
      MEASUREMENT_SECTIONS.map((d, i) => [d.section, filledSection(d.section, i)])
    ) as Partial<MeasurementRecord>;
    const loaded = throughTheDatabase(everything) as unknown as Record<string, unknown>;
    for (const d of MEASUREMENT_SECTIONS) {
      expect(loaded[d.section], d.section).toStrictEqual((everything as Record<string, unknown>)[d.section]);
    }
  });
});

describe('existing numeric data is not touched', () => {
  it('a record written before this change reads back identically', () => {
    const old = {
      coat: { length: 30, chest: 40, stomach: 36.5, hip: 41, shoulder: 18.5, sleeve: 25, xBack: 17.5, collar: 16 },
      pant: { length: 40, waist: 34, hip: 40.5, thigh: 24.5, inLeg: 31, bottom: 15, body: 11 }
    };
    const loaded = throughTheDatabase(old);
    expect(loaded.coat).toStrictEqual(old.coat);
    expect(loaded.pant).toStrictEqual(old.pant);
  });
});

describe('composite garments print exactly what was entered', () => {
  const item = (garmentType: string): OrderItem =>
    ({ id: 'i', garmentType, fabricCode: '', fabricName: '', notes: '', price: 0, quantity: 1 });

  const snapshot: Partial<MeasurementRecord> = {
    coat: { length: '30 L', chest: '40', stomach: 'XL', hip: 41.5 },
    pant: { length: '40 R', waist: '34 Tight', hip: '40' },
    waistcoat: { length: '25 L', chest: '39 Tight' }
  };

  const valuesOf = (blocks: ReturnType<typeof garmentMeasurementBlocks>) =>
    Object.fromEntries(blocks.flatMap(b => b.fields.map(f => [`${b.title}/${f.label}`, f.value])));

  it('a 2 Piece Suit is coat + pant, with the values untouched', () => {
    expect(garmentSections('2 Piece Suit')).toEqual(['coat', 'pant']);
    const v = valuesOf(garmentMeasurementBlocks(item('2 Piece Suit'), snapshot));
    expect(Object.values(v)).toContain('30 L');
    expect(Object.values(v)).toContain('XL');
    expect(Object.values(v)).toContain('34 Tight');
    expect(Object.values(v)).toContain(41.5);
  });

  it('a 3 Piece Suit is coat + pant + waistcoat, with the values untouched', () => {
    expect(garmentSections('3 Piece Suit')).toEqual(['coat', 'pant', 'waistcoat']);
    const v = valuesOf(garmentMeasurementBlocks(item('3 Piece Suit'), snapshot));
    expect(Object.values(v)).toContain('25 L');
    expect(Object.values(v)).toContain('39 Tight');
    expect(Object.values(v)).toContain('40 R');
  });

  it('a waistcoat order never prints the coat\'s values', () => {
    const v = valuesOf(garmentMeasurementBlocks(item('Waistcoat'), snapshot));
    expect(Object.values(v)).toContain('25 L');
    expect(Object.values(v)).not.toContain('30 L');
  });
});
