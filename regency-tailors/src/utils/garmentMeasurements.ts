import { OrderItem, MeasurementRecord } from '../types';

/**
 * Which measurement tables belong to a garment, and what goes in them.
 *
 * Extracted from ProductionSlipProductCard so the customer bill and the
 * workshop slip read the same order from the same rules. Two copies of this
 * mapping would eventually disagree, and a coat measurement printed on the
 * wrong garment is not a defect anyone catches by reading the screen.
 */

export interface MeasurementField {
  label: string;
  value?: string | number;
  colSpan?: boolean;
}

export interface MeasurementCategoryBlock {
  title: string;
  subLabel?: string;
  fields: MeasurementField[];
}

export function garmentMeasurementBlocks(
  item: OrderItem,
  snapshot: Partial<MeasurementRecord>
): MeasurementCategoryBlock[] {
  const gType = (item?.garmentType || '').toLowerCase().trim();
  const categories: MeasurementCategoryBlock[] = [];

  const isSuit = gType.includes('suit');
  const isCoat =
    gType.includes('coat') || gType.includes('blazer') || gType.includes('jacket') ||
    gType.includes('sherwani') || gType.includes('bandhgala') || gType.includes('tuxedo') ||
    gType.includes('safari') || isSuit;

  const isPant =
    gType.includes('pant') || gType.includes('trouser') || gType.includes('slack') ||
    gType.includes('chino') || isSuit;

  const isShirt = gType.includes('shirt');
  const isKurta = gType.includes('kurta');
  const isPajama =
    gType.includes('pajama') || gType.includes('pyjama') || gType.includes('salwar') ||
    gType.includes('churidar') || gType.includes('dhoti') ||
    (isKurta && (gType.includes('pajama') || gType.includes('pyjama') || gType.includes('set')));

  if (isCoat && !isKurta && !isShirt) {
    categories.push({
      title: 'COAT MEASUREMENTS',
      subLabel: 'Jacket / Blazer / Suit',
      fields: [
        { label: 'Length', value: snapshot.coat?.length ?? snapshot.jacket?.jacketLength },
        { label: 'Chest', value: snapshot.coat?.chest ?? snapshot.jacket?.chest },
        { label: 'Stomach', value: snapshot.coat?.stomach ?? snapshot.jacket?.waist },
        { label: 'H.P. / Hip', value: snapshot.coat?.hip ?? snapshot.jacket?.hip },
        { label: 'Shoulder', value: snapshot.coat?.shoulder ?? snapshot.jacket?.shoulderWidth },
        { label: 'Sleeve', value: snapshot.coat?.sleeve ?? snapshot.jacket?.sleeveLength },
        { label: 'X-Back', value: snapshot.coat?.xBack ?? snapshot.jacket?.crossBack },
        { label: 'Collar', value: snapshot.coat?.collar },
        { label: 'Jacket Length', value: snapshot.coat?.jacketLength },
        { label: 'Waistcoat Length', value: snapshot.coat?.waistcoatLength }
      ]
    });
  }

  if (isPant && !isKurta && !isShirt) {
    categories.push({
      title: 'PANT MEASUREMENTS',
      subLabel: 'Trouser / Slacks',
      fields: [
        { label: 'Length', value: snapshot.pant?.length ?? snapshot.trouser?.outseam },
        { label: 'Waist', value: snapshot.pant?.waist ?? snapshot.trouser?.waist },
        { label: 'H.P. / Hip', value: snapshot.pant?.hip ?? snapshot.trouser?.hip },
        { label: 'Thigh', value: snapshot.pant?.thigh ?? snapshot.trouser?.thigh },
        { label: 'In-Leg', value: snapshot.pant?.inLeg ?? snapshot.trouser?.inseam },
        { label: 'Bottom', value: snapshot.pant?.bottom ?? snapshot.trouser?.bottomOpening },
        { label: 'Body', value: snapshot.pant?.body ?? snapshot.trouser?.rise, colSpan: true }
      ]
    });
  }

  if (isShirt) {
    categories.push({
      title: 'SHIRT MEASUREMENTS',
      subLabel: 'Bespoke Dress Shirt',
      fields: [
        { label: 'Length', value: snapshot.shirt?.length },
        { label: 'Chest', value: snapshot.shirt?.chest },
        { label: 'Stomach', value: snapshot.shirt?.stomach },
        { label: 'H.P. / Hip', value: snapshot.shirt?.hip },
        { label: 'Shoulder', value: snapshot.shirt?.shoulder },
        { label: 'Sleeve', value: snapshot.shirt?.sleeve },
        { label: 'Collar', value: snapshot.shirt?.collar },
        { label: 'Cuff', value: snapshot.shirt?.cuff }
      ]
    });
  }

  if (isKurta) {
    categories.push({
      title: 'KURTA MEASUREMENTS',
      subLabel: 'Ethnic Kurta',
      fields: [
        { label: 'Length', value: snapshot.kurta?.length },
        { label: 'Chest', value: snapshot.kurta?.chest },
        { label: 'Stomach', value: snapshot.kurta?.stomach },
        { label: 'H.P. / Hip', value: snapshot.kurta?.hip },
        { label: 'Shoulder', value: snapshot.kurta?.shoulder },
        { label: 'Sleeve', value: snapshot.kurta?.sleeve },
        { label: 'Bicep', value: snapshot.kurta?.bicep },
        { label: 'Cuff', value: snapshot.kurta?.cuff },
        { label: 'Collar', value: snapshot.kurta?.collar }
      ]
    });
  }

  if (isPajama) {
    categories.push({
      title: 'PAJAMA MEASUREMENTS',
      subLabel: 'Churidar / Salwar',
      fields: [
        { label: 'Length', value: snapshot.pajama?.length },
        { label: 'Waist', value: snapshot.pajama?.waist },
        { label: 'H.P. / Hip', value: snapshot.pajama?.hip },
        { label: 'Thigh', value: snapshot.pajama?.thigh },
        { label: 'In-Leg', value: snapshot.pajama?.inLeg },
        { label: 'Bottom', value: snapshot.pajama?.bottom },
        { label: 'Body', value: snapshot.pajama?.body, colSpan: true }
      ]
    });
  }

  if (categories.length === 0) {
    categories.push({
      title: `${(item?.garmentType || 'GARMENT').toUpperCase()} MEASUREMENTS`,
      subLabel: 'Custom Tailoring',
      fields: [
        { label: 'Length', value: snapshot.coat?.length ?? snapshot.pant?.length ?? snapshot.shirt?.length },
        { label: 'Chest / Waist', value: snapshot.coat?.chest ?? snapshot.pant?.waist ?? snapshot.shirt?.chest },
        { label: 'Stomach / Hip', value: snapshot.coat?.stomach ?? snapshot.pant?.hip ?? snapshot.shirt?.stomach },
        { label: 'Shoulder / Thigh', value: snapshot.coat?.shoulder ?? snapshot.pant?.thigh ?? snapshot.shirt?.shoulder },
        { label: 'Sleeve / In-Leg', value: snapshot.coat?.sleeve ?? snapshot.pant?.inLeg ?? snapshot.shirt?.sleeve },
        { label: 'Collar / Bottom', value: snapshot.shirt?.collar ?? snapshot.pant?.bottom ?? snapshot.coat?.xBack, colSpan: true }
      ]
    });
  }

  return categories;
}

/**
 * The remark recorded against this specific garment. Never another garment's:
 * the line item is checked first, and the snapshot map is only consulted for
 * this garment's own key.
 */
export function garmentRemarkFor(item: OrderItem, snapshot: Partial<MeasurementRecord>): string {
  const type = item?.garmentType || '';
  const lower = type.toLowerCase();
  const remarks = snapshot?.garmentRemarks;

  const candidate =
    item?.remarks ||
    remarks?.[type] ||
    (lower.includes('coat') ? remarks?.['Coat'] : undefined) ||
    (lower.includes('shirt') ? remarks?.['Shirt'] : undefined) ||
    (lower.includes('kurta') ? remarks?.['Kurta Pajama'] : undefined) ||
    '';

  return typeof candidate === 'string' ? candidate.trim() : '';
}

/** Number of measurement values actually recorded for a garment. */
export function recordedMeasurementCount(blocks: MeasurementCategoryBlock[]): number {
  return blocks.reduce(
    (sum, block) =>
      sum + block.fields.filter(f => f.value !== undefined && f.value !== null && f.value !== '').length,
    0
  );
}
