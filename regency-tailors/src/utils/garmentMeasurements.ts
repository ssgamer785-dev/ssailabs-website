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

/** The five measurement tables a customer's record can hold. */
export type MeasurementSection = 'coat' | 'pant' | 'shirt' | 'kurta' | 'pajama';

interface SectionFieldDefinition {
  /** Printed exactly as written, on the slip and on the measurement sheet. */
  label: string;
  /** Key within the section's own object. */
  key: string;
  /** Key within the legacy section, read only when the modern one is unset. */
  legacyKey?: string;
  colSpan?: boolean;
}

interface SectionDefinition {
  section: MeasurementSection;
  title: string;
  subLabel: string;
  /** Records written by the older data model stored this section elsewhere. */
  legacySection?: 'jacket' | 'trouser';
  fields: SectionFieldDefinition[];
}

/**
 * The canonical measurement set for every garment the showroom makes.
 *
 * This is the single definition of what a garment's measurements are, in what
 * order, under what label. The workshop production slip and the customer's
 * bespoke measurement sheet both derive from it, which is the point: the sheet
 * used to carry its own hand-written copy of these lists and had silently
 * fallen three fields behind on the coat and two on the kurta. A second copy of
 * a list like this does not stay correct, and a coat cut without its waistcoat
 * length is not a mistake anyone catches by reading the screen.
 *
 * Field order is deliberate — it is the order the tape measure goes round the
 * customer, and the order the entry form asks for them in.
 */
export const MEASUREMENT_SECTIONS: readonly SectionDefinition[] = [
  {
    section: 'coat',
    title: 'COAT MEASUREMENTS',
    subLabel: 'Jacket / Blazer / Suit',
    legacySection: 'jacket',
    fields: [
      { label: 'Length', key: 'length', legacyKey: 'jacketLength' },
      { label: 'Chest', key: 'chest', legacyKey: 'chest' },
      { label: 'Stomach', key: 'stomach', legacyKey: 'waist' },
      { label: 'H.P. / Hip', key: 'hip', legacyKey: 'hip' },
      { label: 'Shoulder', key: 'shoulder', legacyKey: 'shoulderWidth' },
      { label: 'Sleeve', key: 'sleeve', legacyKey: 'sleeveLength' },
      { label: 'X-Back', key: 'xBack', legacyKey: 'crossBack' },
      { label: 'Collar', key: 'collar' },
      { label: 'Jacket Length', key: 'jacketLength' },
      { label: 'Waistcoat Length', key: 'waistcoatLength' }
    ]
  },
  {
    section: 'pant',
    title: 'PANT MEASUREMENTS',
    subLabel: 'Trouser / Slacks',
    legacySection: 'trouser',
    fields: [
      { label: 'Length', key: 'length', legacyKey: 'outseam' },
      { label: 'Waist', key: 'waist', legacyKey: 'waist' },
      { label: 'H.P. / Hip', key: 'hip', legacyKey: 'hip' },
      { label: 'Thigh', key: 'thigh', legacyKey: 'thigh' },
      { label: 'In-Leg', key: 'inLeg', legacyKey: 'inseam' },
      { label: 'Bottom', key: 'bottom', legacyKey: 'bottomOpening' },
      { label: 'Body', key: 'body', legacyKey: 'rise', colSpan: true }
    ]
  },
  {
    section: 'shirt',
    title: 'SHIRT MEASUREMENTS',
    subLabel: 'Bespoke Dress Shirt',
    fields: [
      { label: 'Length', key: 'length' },
      { label: 'Chest', key: 'chest' },
      { label: 'Stomach', key: 'stomach' },
      { label: 'H.P. / Hip', key: 'hip' },
      { label: 'Shoulder', key: 'shoulder' },
      { label: 'Sleeve', key: 'sleeve' },
      { label: 'Collar', key: 'collar' },
      { label: 'Cuff', key: 'cuff' }
    ]
  },
  {
    section: 'kurta',
    title: 'KURTA MEASUREMENTS',
    subLabel: 'Ethnic Kurta',
    fields: [
      { label: 'Length', key: 'length' },
      { label: 'Chest', key: 'chest' },
      { label: 'Stomach', key: 'stomach' },
      { label: 'H.P. / Hip', key: 'hip' },
      { label: 'Shoulder', key: 'shoulder' },
      { label: 'Sleeve', key: 'sleeve' },
      { label: 'Bicep', key: 'bicep' },
      { label: 'Cuff', key: 'cuff' },
      { label: 'Collar', key: 'collar' }
    ]
  },
  {
    section: 'pajama',
    title: 'PAJAMA MEASUREMENTS',
    subLabel: 'Churidar / Salwar',
    fields: [
      { label: 'Length', key: 'length' },
      { label: 'Waist', key: 'waist' },
      { label: 'H.P. / Hip', key: 'hip' },
      { label: 'Thigh', key: 'thigh' },
      { label: 'In-Leg', key: 'inLeg' },
      { label: 'Bottom', key: 'bottom' },
      { label: 'Body', key: 'body', colSpan: true }
    ]
  }
];

const SECTION_BY_NAME = new Map(MEASUREMENT_SECTIONS.map(d => [d.section, d]));

/** A section's own value, falling back to the legacy shape only when unset. */
function readSectionField(
  snapshot: Partial<MeasurementRecord>,
  def: SectionDefinition,
  field: SectionFieldDefinition
): string | number | undefined {
  const own = (snapshot as Record<string, any>)[def.section]?.[field.key];
  if (own !== undefined && own !== null) return own;
  if (def.legacySection && field.legacyKey) {
    return (snapshot as Record<string, any>)[def.legacySection]?.[field.legacyKey];
  }
  return undefined;
}

/** Builds one garment's measurement table from the canonical definition. */
function buildSectionBlock(
  def: SectionDefinition,
  snapshot: Partial<MeasurementRecord>
): MeasurementCategoryBlock {
  return {
    title: def.title,
    subLabel: def.subLabel,
    fields: def.fields.map(field => {
      const built: MeasurementField = { label: field.label, value: readSectionField(snapshot, def, field) };
      if (field.colSpan) built.colSpan = true;
      return built;
    })
  };
}

const sectionBlock = (name: MeasurementSection, snapshot: Partial<MeasurementRecord>) =>
  buildSectionBlock(SECTION_BY_NAME.get(name)!, snapshot);

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
    categories.push(sectionBlock('coat', snapshot));
  }

  if (isPant && !isKurta && !isShirt) {
    categories.push(sectionBlock('pant', snapshot));
  }

  if (isShirt) {
    categories.push(sectionBlock('shirt', snapshot));
  }

  if (isKurta) {
    categories.push(sectionBlock('kurta', snapshot));
  }

  if (isPajama) {
    categories.push(sectionBlock('pajama', snapshot));
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

/** A block of a customer's measurement record, tagged with its section. */
export interface RecordMeasurementBlock extends MeasurementCategoryBlock {
  section: MeasurementSection;
}

/**
 * Every measurement table a customer's record actually holds, complete.
 *
 * Where `garmentMeasurementBlocks` answers "what does this garment on this
 * order need?", this answers "what has been recorded for this customer?" — the
 * question the bespoke measurement sheet asks. Both read the same canonical
 * definitions, so a field added to a garment appears on the workshop slip and
 * on the customer's sheet together, or on neither.
 *
 * A section is included when the record carries it, under either the current
 * name or the legacy one, matching what the sheet has always shown.
 */
export function recordMeasurementBlocks(record: Partial<MeasurementRecord>): RecordMeasurementBlock[] {
  return MEASUREMENT_SECTIONS.filter(def => {
    const own = (record as Record<string, unknown>)[def.section];
    const legacy = def.legacySection ? (record as Record<string, unknown>)[def.legacySection] : undefined;
    return Boolean(own || legacy);
  }).map(def => ({ section: def.section, ...buildSectionBlock(def, record) }));
}

/**
 * How an unrecorded measurement prints: an em dash, never a blank.
 *
 * A blank slot reads as an oversight; a dash says the measurement was not
 * taken, which is information the workshop can act on. Zero is a real value and
 * prints as zero — the sheet used to fall back to a dash for it, because it
 * tested with `||`.
 */
export function measurementDisplayValue(value?: string | number | null): string {
  return value !== undefined && value !== null && value !== '' ? String(value) : '—';
}
