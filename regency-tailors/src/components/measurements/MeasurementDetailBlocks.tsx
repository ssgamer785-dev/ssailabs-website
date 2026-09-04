import React from 'react';
import { MeasurementRecord } from '../../types';
import {
  recordMeasurementBlocks,
  measurementDisplayValue,
  MeasurementSection
} from '../../utils/garmentMeasurements';

const SECTION_ICONS: Record<MeasurementSection, string> = {
  coat: '🧥',
  pant: '👖',
  shirt: '👔',
  kurta: '👘',
  pajama: '🩳'
};

interface MeasurementDetailBlocksProps {
  record: Partial<MeasurementRecord>;
  /** Cells per row on a wide screen. Two on narrow, always. */
  columns?: 3 | 4;
  /** How the garment sections themselves are arranged, so each host keeps the
   *  arrangement it already had. */
  layout?: 'stack' | 'grid';
}

/**
 * A customer's measurements as read-only cards, for the on-screen dossiers:
 * order details, the customer profile, and the client portal.
 *
 * All three used to build these lists themselves, and all three were wrong in
 * their own way. The client portal wrote out seven coat fields by hand and
 * stopped at X-Back, so Collar, Jacket Length and Waistcoat Length never
 * appeared. Order details and the customer profile mapped `Object.entries`
 * over the stored object, which is worse than it looks: a measurement the
 * counter hand left blank is not a key, so it vanished silently rather than
 * showing as unrecorded; the labels were raw property names (`waistcoatLength`
 * rendered as "Waistcoatlength"); and the order was whatever order the object
 * happened to have been built in. Order details also had no pajama block at
 * all, under a heading that said "Kurta & Pajama".
 *
 * Everything here now comes from the canonical definitions the workshop
 * production slip and the bespoke measurement sheet read, so every screen
 * shows the same fields, under the same labels, in the same order — and a
 * field added to a garment reaches all of them at once.
 */
export const MeasurementDetailBlocks: React.FC<MeasurementDetailBlocksProps> = ({
  record,
  columns = 4,
  layout = 'stack'
}) => {
  const unitSuffix = record.unit === 'cm' ? 'cm' : '"';
  const wide = columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4';

  return (
    <div className={layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}>
      {recordMeasurementBlocks(record).map(block => (
        <div
          key={block.section}
          className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
            <h4 className="font-extrabold text-xs text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
              <span>{SECTION_ICONS[block.section]}</span>
              <span>{block.title}</span>
            </h4>
            <span className="text-[10px] text-[#8C7E6A] font-mono">{record.unit || 'in'}</span>
          </div>

          <div className={`grid grid-cols-2 ${wide} gap-2 text-xs`}>
            {block.fields.map(field => (
              <div
                key={field.label}
                className="bg-white p-2.5 rounded-xl border border-[#EAE4D8]"
              >
                <div className="text-[10px] text-[#8C7E6A] font-bold">{field.label}</div>
                <div className="text-sm font-black text-[#071426]">
                  {measurementDisplayValue(field.value)} {unitSuffix}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
