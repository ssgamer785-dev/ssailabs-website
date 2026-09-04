import React from 'react';
import { MeasurementRecord } from '../../types';
import {
  recordMeasurementBlocks,
  measurementDisplayValue,
  MeasurementSection
} from '../../utils/garmentMeasurements';

/** Decoration for the section headers. The fields themselves come from the
 *  canonical definitions, so the sheet cannot drift from the workshop slip. */
const SECTION_ICONS: Record<MeasurementSection, string> = {
  coat: '🧥',
  pant: '👖',
  shirt: '👔',
  kurta: '👘',
  pajama: '🩳'
};

interface MeasurementSheetBlocksProps {
  record: Partial<MeasurementRecord>;
}

/**
 * The measurement tables on the customer's bespoke measurement sheet.
 *
 * Every field the garment defines is printed, in the canonical order, including
 * the ones with no value recorded — a dash says the measurement was not taken,
 * which is information, where a missing row just looks like an oversight.
 *
 * These blocks used to be written out by hand in `MeasurementsView` and had
 * quietly fallen behind the definitions the workshop slip reads from: the coat
 * was missing Collar, Jacket Length and Waistcoat Length, and the kurta was
 * missing Bicep and Cuff with Collar sitting two places early. Deriving them
 * from `recordMeasurementBlocks` is what stops that happening again — a field
 * added to a garment now appears on the slip and on this sheet together, or on
 * neither.
 */
export const MeasurementSheetBlocks: React.FC<MeasurementSheetBlocksProps> = ({ record }) => {
  const unitSuffix = record.unit === 'cm' ? 'cm' : '"';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {recordMeasurementBlocks(record).map(block => (
        <div
          key={block.section}
          className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC] print:break-inside-avoid"
        >
          <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
              <span>{SECTION_ICONS[block.section]}</span>
              <span>{block.title}</span>
            </h3>
            <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {record.unit || 'in'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {block.fields.map((field, idx) => (
              <div
                key={field.label}
                className={`bg-white p-2 rounded-lg border border-[#EAE4D8] ${field.colSpan ? 'col-span-2' : ''}`}
              >
                <div className="text-[10px] text-[#8C7E6A] font-bold">
                  {idx + 1}. {field.label}
                </div>
                <div className="text-sm font-extrabold text-[#071426]">
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
