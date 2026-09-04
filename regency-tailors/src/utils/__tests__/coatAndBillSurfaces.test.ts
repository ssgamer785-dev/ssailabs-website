import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MEASUREMENT_SECTIONS,
  sectionFields,
  garmentMeasurementBlocks,
  recordMeasurementBlocks
} from '../garmentMeasurements';
import { densityTokens, DENSITY_ORDER } from '../orderBillLayout';
import { MeasurementSheetBlocks } from '../../components/measurements/MeasurementSheetBlocks';
import { MeasurementDetailBlocks } from '../../components/measurements/MeasurementDetailBlocks';
import { ProductionSlipProductCard } from '../../components/production/ProductionSlipProductCard';
import { OrderBillGarmentRow } from '../../components/bills/OrderBillGarmentRow';
import { MeasurementRecord, OrderItem } from '../../types';

/**
 * Two guarantees, held by rendering the real components:
 *
 *   1. Coat carries its full ten measurements on every screen that shows the
 *      complete set. Collar, Jacket Length and Waistcoat Length were the three
 *      that kept going missing — the client portal stopped at X-Back, the
 *      order wizard's review line stopped at Collar, and the dossiers mapped
 *      `Object.entries` over the stored object so anything left blank was not
 *      a key and simply vanished.
 *
 *   2. The customer's bill carries no remarks column, and no empty column
 *      where one used to be. Remarks are workshop instructions and belong on
 *      the slip that goes to the bench.
 */

/* ------------------------------------------------------------- fixtures */

const COAT_LABELS = [
  'Length', 'Chest', 'Stomach', 'H.P. / Hip', 'Shoulder',
  'Sleeve', 'X-Back', 'Collar', 'Jacket Length', 'Waistcoat Length'
];
const COAT_KEYS = [
  'length', 'chest', 'stomach', 'hip', 'shoulder',
  'sleeve', 'xBack', 'collar', 'jacketLength', 'waistcoatLength'
];

/** COAT-01 … COAT-10, one per field. */
const coatValues = (): Record<string, string> =>
  Object.fromEntries(COAT_KEYS.map((k, i) => [k, `COAT-${String(i + 1).padStart(2, '0')}`]));

const coatRecord = (): Partial<MeasurementRecord> => ({
  unit: 'inches',
  coat: coatValues() as MeasurementRecord['coat']
});

const item = (garmentType: string, extra: Partial<OrderItem> = {}): OrderItem =>
  ({ id: `ITEM-${garmentType}`, garmentType, price: 0, quantity: 1, ...extra }) as OrderItem;

const text = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const positions = (haystack: string, needles: string[]): number[] =>
  needles.map(n => haystack.indexOf(n));

const inOrder = (xs: number[]): boolean =>
  xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

const render = (el: React.ReactElement): string => text(renderToStaticMarkup(el));

/** Every rendered surface that is meant to show the complete coat set. */
const COAT_SURFACES: [string, (record: Partial<MeasurementRecord>) => string][] = [
  [
    'bespoke measurement sheet',
    record => render(React.createElement(MeasurementSheetBlocks, { record }))
  ],
  [
    'order / customer / client-portal dossier',
    record => render(React.createElement(MeasurementDetailBlocks, { record }))
  ],
  [
    'production slip',
    record =>
      render(
        React.createElement(ProductionSlipProductCard, {
          item: item('Coat'),
          orderNumber: '1',
          snapshot: record
        })
      )
  ]
];

/* ----------------------------------------------- 1. the canonical model */

describe('the canonical coat set', () => {
  it('has all ten measurements in the required order', () => {
    const coat = MEASUREMENT_SECTIONS.find(s => s.section === 'coat')!;
    expect(coat.fields.map(f => f.label)).toEqual(COAT_LABELS);
  });

  it('exposes the same ten to the entry forms, numbered from one', () => {
    const fields = sectionFields('coat');
    expect(fields).toHaveLength(10);
    expect(fields.map(f => f.label)).toEqual(COAT_LABELS);
    expect(fields.map(f => f.key)).toEqual(COAT_KEYS);
  });

  it('places Collar, Jacket Length and Waistcoat Length last, in that order', () => {
    expect(sectionFields('coat').slice(7).map(f => f.label))
      .toEqual(['Collar', 'Jacket Length', 'Waistcoat Length']);
  });
});

/* ------------------------------------------ 2. every rendered surface */

describe.each(COAT_SURFACES)('%s', (_name, renderSurface) => {
  it('prints all ten coat labels', () => {
    const body = renderSurface(coatRecord());
    for (const label of COAT_LABELS) {
      expect(body, `missing label "${label}"`).toContain(label);
    }
  });

  it('prints all ten coat values', () => {
    const body = renderSurface(coatRecord());
    for (const value of Object.values(coatValues())) {
      expect(body, `missing value "${value}"`).toContain(value);
    }
  });

  it('carries Collar, Jacket Length and Waistcoat Length specifically', () => {
    // The three that kept going missing, asserted on their own so a failure
    // says which one came back.
    const body = renderSurface(coatRecord());
    expect(body).toContain('Collar');
    expect(body).toContain('COAT-08');
    expect(body).toContain('Jacket Length');
    expect(body).toContain('COAT-09');
    expect(body).toContain('Waistcoat Length');
    expect(body).toContain('COAT-10');
  });

  it('prints them in the canonical order', () => {
    const body = renderSurface(coatRecord());
    expect(inOrder(positions(body, Object.values(coatValues())))).toBe(true);
  });

  it('prints every slot when nothing was recorded', () => {
    const body = renderSurface({ unit: 'inches', coat: {} });
    for (const label of COAT_LABELS) expect(body).toContain(label);
    expect(body.match(/—/g) || []).toHaveLength(10);
  });

  it('shows a recorded zero as zero, never as a dash', () => {
    const body = renderSurface({
      unit: 'inches',
      coat: { chest: 0, waistcoatLength: 0 } as MeasurementRecord['coat']
    });
    expect(body).toContain('Waistcoat Length 0');
    expect(body.match(/—/g) || []).toHaveLength(8);
  });

  it('keeps a field the customer left blank visible as unrecorded', () => {
    // `Object.entries` over the stored object used to drop these entirely.
    const body = renderSurface({
      unit: 'inches',
      coat: { length: '30', collar: '16' } as MeasurementRecord['coat']
    });
    expect(body).toContain('Waistcoat Length');
    expect(body).toContain('Jacket Length');
    expect(body).toContain('X-Back');
  });
});

/* --------------------------------------- 3. the surfaces agree exactly */

describe('every coat surface shows the same fields', () => {
  it('sheet, dossier and slip agree label for label', () => {
    const record = coatRecord();
    const sheet = recordMeasurementBlocks(record).find(b => b.section === 'coat')!;
    const slip = garmentMeasurementBlocks(item('Coat'), record)
      .find(b => b.title === 'COAT MEASUREMENTS')!;

    expect(sheet.fields.map(f => f.label)).toEqual(COAT_LABELS);
    expect(slip.fields.map(f => f.label)).toEqual(COAT_LABELS);
    expect(sheet.fields.map(f => f.value)).toEqual(slip.fields.map(f => f.value));
  });

  it('the entry form offers exactly what the documents print', () => {
    const slip = garmentMeasurementBlocks(item('Coat'), coatRecord())
      .find(b => b.title === 'COAT MEASUREMENTS')!;
    expect(sectionFields('coat').map(f => f.label)).toEqual(slip.fields.map(f => f.label));
  });
});

/* ---------------------------------------------- 4. save / reload flow */

describe('entry -> save -> reload -> display', () => {
  it('carries Collar, Jacket Length and Waistcoat Length the whole way', () => {
    // What entry produces: a value under every canonical key.
    const entered = Object.fromEntries(
      sectionFields('coat').map((f, i) => [f.key, `COAT-${String(i + 1).padStart(2, '0')}`])
    );

    // What persistence does with it: the section object is stored and read back
    // whole, as one jsonb document, so a round trip is a structural copy.
    const reloaded: Partial<MeasurementRecord> = {
      unit: 'inches',
      coat: JSON.parse(JSON.stringify(entered))
    };

    expect(reloaded.coat).toEqual(entered);
    expect((reloaded.coat as Record<string, string>).collar).toBe('COAT-08');
    expect((reloaded.coat as Record<string, string>).jacketLength).toBe('COAT-09');
    expect((reloaded.coat as Record<string, string>).waistcoatLength).toBe('COAT-10');

    // And every surface still shows all three after the round trip.
    for (const [name, renderSurface] of COAT_SURFACES) {
      const body = renderSurface(reloaded);
      expect(body, `${name} lost Collar`).toContain('COAT-08');
      expect(body, `${name} lost Jacket Length`).toContain('COAT-09');
      expect(body, `${name} lost Waistcoat Length`).toContain('COAT-10');
    }
  });
});

/* ---------------------------------------- 5. legacy coat records still work */

describe('a coat stored under the legacy jacket shape', () => {
  it('still prints all ten slots, filling what the legacy shape can', () => {
    const record: Partial<MeasurementRecord> = {
      unit: 'inches',
      jacket: {
        chest: 41, waist: 37, hip: 42, shoulderWidth: 19,
        sleeveLength: 26, jacketLength: 31, crossBack: 18
      }
    };
    for (const [name, renderSurface] of COAT_SURFACES) {
      const body = renderSurface(record);
      for (const label of COAT_LABELS) {
        expect(body, `${name} missing "${label}"`).toContain(label);
      }
      // The legacy shape never carried a collar or a waistcoat length.
      expect(body).toContain('Waistcoat Length');
    }
  });
});

/* ------------------------------------------------- 6. the customer bill */

describe('the customer bill has no remarks column', () => {
  const tokens = densityTokens('roomy');

  const renderRow = (extra: Partial<OrderItem> = {}, snapshot: Partial<MeasurementRecord> = {}) =>
    renderToStaticMarkup(
      React.createElement('table', null,
        React.createElement('tbody', null,
          React.createElement(OrderBillGarmentRow, {
            item: item('Coat', extra),
            index: 0,
            snapshot,
            tokens
          })
        )
      )
    );

  it('renders exactly four cells: S.No., garment, quantity, amount', () => {
    const markup = renderRow();
    expect((markup.match(/<td/g) || []).length).toBe(4);
  });

  it('never prints a garment remark, however it was recorded', () => {
    const onItem = text(renderRow({ remarks: 'REMARK-ON-ITEM' }));
    expect(onItem).not.toContain('REMARK-ON-ITEM');

    const onSnapshot = text(renderRow({}, { garmentRemarks: { Coat: 'REMARK-ON-SNAPSHOT' } }));
    expect(onSnapshot).not.toContain('REMARK-ON-SNAPSHOT');
  });

  it('leaves no empty column where remarks used to be', () => {
    // The old row printed an em dash in the remarks cell when there was no
    // remark. Four cells and no stray dash means the column is gone, not blank.
    const markup = renderRow();
    expect((markup.match(/<td/g) || []).length).toBe(4);
    expect(text(markup)).not.toContain('—');
  });

  it('still prints the garment, the quantity and a blank amount line', () => {
    const body = text(renderRow({ quantity: 3 }));
    expect(body).toContain('Coat');
    expect(body).toContain('3');
    expect(renderRow({ quantity: 3 })).toContain('aria-label="Amount — filled in by hand"');
    // No currency, no computed figure.
    expect(body).not.toContain('₹');
  });

  it('defines four columns at every density, summing to a full table', () => {
    for (const key of DENSITY_ORDER) {
      const c = densityTokens(key).columns;
      expect(Object.keys(c).sort()).toEqual(['amount', 'garment', 'qty', 'sno']);
      expect(c.sno + c.garment + c.qty + c.amount).toBeCloseTo(100, 5);
      expect(c.amount).toBeGreaterThanOrEqual(12);
    }
  });
});

/* -------------------------------------- 7. the slip still carries remarks */

describe('remarks survive where they belong', () => {
  it('the production slip still prints the garment remark', () => {
    const body = render(
      React.createElement(ProductionSlipProductCard, {
        item: item('Coat', { remarks: 'REMARK-ON-ITEM' }),
        orderNumber: '1',
        snapshot: coatRecord()
      })
    );
    expect(body).toContain('Remarks');
    expect(body).toContain('REMARK-ON-ITEM');
  });

  it('and the slip still carries all ten coat measurements alongside it', () => {
    const body = render(
      React.createElement(ProductionSlipProductCard, {
        item: item('Coat', { remarks: 'Peak lapel' }),
        orderNumber: '1',
        snapshot: coatRecord()
      })
    );
    for (const label of COAT_LABELS) expect(body).toContain(label);
    expect(body).toContain('Peak lapel');
  });
});
