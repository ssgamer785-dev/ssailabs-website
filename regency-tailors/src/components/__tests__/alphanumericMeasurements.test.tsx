import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MeasurementDetailBlocks } from '../measurements/MeasurementDetailBlocks';
import { MeasurementSheetBlocks } from '../measurements/MeasurementSheetBlocks';
import { ProductionSlipProductCard } from '../production/ProductionSlipProductCard';
import { MeasurementRecord, OrderItem } from '../../types';

/**
 * The screens that print a measurement print the value the tailor wrote.
 * `XL` is not inches, so it is not followed by an inch mark; `38` still is.
 */

const record = (over: Partial<MeasurementRecord> = {}): MeasurementRecord => ({
  id: 'm1',
  customerId: 'c1',
  customerName: 'Vikram Malhotra',
  garmentType: 'Coat',
  unit: 'inches',
  lastUpdated: '2026-09-23',
  coat: { length: '30 L', chest: '40', stomach: 'XL', hip: 41.5, shoulder: '18.5 R', sleeve: '38 Tight' },
  pant: { length: '40', waist: '34 Tight', thigh: 'Regular' },
  waistcoat: { length: '25 L', chest: '39' },
  jacketGarment: { length: '31 R', collar: 'XL' },
  sherwani: { length: '42 L', sleeve: '15 1/2' },
  ...over
});

const item = (garmentType: string): OrderItem =>
  ({ id: 'i', garmentType, fabricCode: '', fabricName: '', notes: '', price: 0, quantity: 1 });

/** Visible text of the markup, so an inch mark is judged where it prints. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const SCREENS: [string, (r: MeasurementRecord) => string][] = [
  ['order details / customer profile / portal cards', r => renderToStaticMarkup(<MeasurementDetailBlocks record={r} />)],
  ['the bespoke measurement sheet', r => renderToStaticMarkup(<MeasurementSheetBlocks record={r} />)]
];

describe.each(SCREENS)('%s', (_name, render) => {
  it('shows every alphanumeric value exactly as typed', () => {
    const out = text(render(record()));
    for (const v of ['30 L', 'XL', '18.5 R', '38 Tight', '34 Tight', 'Regular', '25 L', '31 R', '42 L', '15 1/2']) {
      expect(out, v).toContain(v);
    }
  });

  it('does not put an inch mark after a value with letters', () => {
    const out = text(render(record()));
    expect(out).not.toMatch(/XL\s*"/);
    expect(out).not.toMatch(/30 L\s*"/);
    expect(out).not.toMatch(/38 Tight\s*"/);
    expect(out).not.toMatch(/Regular\s*"/);
  });

  it('still marks a plain number, as before', () => {
    const out = text(render(record()));
    expect(out).toMatch(/\|40\s*"\|/);
    expect(out).toMatch(/\|41\.5\s*"\|/);
  });

  it('uses cm for numbers when the record is in cm', () => {
    const out = text(render(record({ unit: 'cm' })));
    expect(out).toMatch(/\|40\s*cm\|/);
    expect(out).not.toMatch(/XL\s*cm/);
  });

  it('shows the waistcoat, jacket and sherwani, not just coat and pant', () => {
    const out = text(render(record()));
    expect(out).toContain('25 L');   // waistcoat length
    expect(out).toContain('31 R');   // jacket length
    expect(out).toContain('42 L');   // sherwani length
  });
});

describe('the production slip prints alphanumeric values', () => {
  const slip = (garment: string, r = record()) =>
    text(renderToStaticMarkup(
      <ProductionSlipProductCard item={item(garment)} orderNumber="7" snapshot={r} />
    ));

  it('a coat', () => {
    const out = slip('Coat');
    for (const v of ['30 L', 'XL', '18.5 R', '38 Tight']) expect(out, v).toContain(v);
  });

  it('a pant', () => {
    const out = slip('Pant');
    for (const v of ['34 Tight', 'Regular']) expect(out, v).toContain(v);
  });

  it('a 2 Piece Suit prints coat and pant values, and no waistcoat', () => {
    const out = slip('2 Piece Suit');
    expect(out).toContain('30 L');
    expect(out).toContain('34 Tight');
    expect(out).not.toContain('25 L');
  });

  it('a 3 Piece Suit prints coat, pant and waistcoat values', () => {
    const out = slip('3 Piece Suit');
    for (const v of ['30 L', '34 Tight', '25 L']) expect(out, v).toContain(v);
  });

  it('a waistcoat, a jacket and a sherwani each print only their own', () => {
    expect(slip('Waistcoat')).toContain('25 L');
    expect(slip('Waistcoat')).not.toContain('30 L');
    expect(slip('Jacket')).toContain('31 R');
    expect(slip('Sherwani')).toContain('42 L');
    expect(slip('Sherwani')).toContain('15 1/2');
  });

  it('does not alter a value: no inch mark, no rounding, no uppercasing', () => {
    const out = slip('Coat', record({ coat: { length: '30 l', chest: '40.50', stomach: ' x ' } }));
    expect(out).toContain('30 l');
    expect(out).toContain('40.50');
  });

  it('an unrecorded measurement is still a dash', () => {
    const out = slip('Coat', record({ coat: { length: '30' } }));
    expect(out).toContain('—');
  });
});
