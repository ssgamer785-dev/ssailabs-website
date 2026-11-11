import { describe, it, expect } from 'vitest';
import { garmentRemarkFor } from '../garmentMeasurements';
import { OrderItem, MeasurementRecord } from '../../types';

/**
 * A remark belongs to the garment it was written for.
 *
 * "Waistcoat" contains "coat". The lookup fell back to the Coat's remark with a
 * bare substring test, so a waistcoat with no remark of its own printed the
 * coat's — instructions for a different garment on the cutter's sheet.
 */

const item = (garmentType: string, remarks = ''): OrderItem =>
  ({ id: 'i', garmentType, fabricCode: '', fabricName: '', notes: '', price: 0, quantity: 1, remarks });

const snapshot = (garmentRemarks: Record<string, string>): Partial<MeasurementRecord> => ({ garmentRemarks });

describe('a waistcoat never takes the coat\'s remark', () => {
  const snap = snapshot({ Coat: 'Peak lapel, surgeon cuffs' });

  it('a waistcoat with no remark of its own has none', () => {
    expect(garmentRemarkFor(item('Waistcoat'), snap)).toBe('');
  });

  it('whichever way the name is spelled', () => {
    for (const name of ['Waistcoat', 'WAISTCOAT', 'Waist Coat', 'waist-coat', 'Waist-Coat']) {
      expect(garmentRemarkFor(item(name), snap), name).toBe('');
    }
  });

  it('a waistcoat keeps a remark that really is its own', () => {
    expect(garmentRemarkFor(item('Waistcoat', 'Five buttons'), snap)).toBe('Five buttons');
    expect(garmentRemarkFor(item('Waistcoat'), snapshot({ Coat: 'Peak lapel', Waistcoat: 'Adjuster at back' })))
      .toBe('Adjuster at back');
  });
});

describe('the coat, and everything else, still behave as before', () => {
  const snap = snapshot({ Coat: 'Peak lapel, surgeon cuffs', Shirt: 'French cuff', 'Kurta Pajama': 'Piping' });

  it('a coat takes its own remark', () => {
    expect(garmentRemarkFor(item('Coat'), snap)).toBe('Peak lapel, surgeon cuffs');
  });

  it('an older composite name that contains "coat" still finds the coat\'s remark', () => {
    expect(garmentRemarkFor(item('Full Coat Pant'), snap)).toBe('Peak lapel, surgeon cuffs');
  });

  it('shirt and kurta find theirs', () => {
    expect(garmentRemarkFor(item('Shirt'), snap)).toBe('French cuff');
    expect(garmentRemarkFor(item('Kurta Pajama'), snap)).toBe('Piping');
  });

  it('the line item\'s own remark always wins', () => {
    expect(garmentRemarkFor(item('Coat', 'Double vent'), snap)).toBe('Double vent');
  });

  it('a jacket, sherwani and the suits do not borrow the coat\'s', () => {
    for (const g of ['Jacket', 'Sherwani', '2 Piece Suit', '3 Piece Suit', 'Pant']) {
      expect(garmentRemarkFor(item(g), snap), g).toBe('');
    }
  });

  it('trims, and tolerates a missing snapshot', () => {
    expect(garmentRemarkFor(item('Coat', '  spaced  '), snap)).toBe('spaced');
    expect(garmentRemarkFor(item('Coat'), {})).toBe('');
  });
});
