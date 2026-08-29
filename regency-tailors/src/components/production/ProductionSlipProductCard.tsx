import React from 'react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from '../../utils/garmentMeasurements';

interface ProductionSlipProductCardProps {
  item: OrderItem;
  index: number; // 0-indexed, display as #{index + 1}
  snapshot: Partial<MeasurementRecord>;
}

/** Measurement cells per row. Five keeps the longest label ("Waistcoat Length")
 *  on one line at A4 width while still packing ten coat fields into two rows. */
const MEASUREMENT_COLUMNS = 5;

/**
 * One garment on the workshop production slip.
 *
 * Built for a black-and-white laser printer: black rules, black text, white
 * paper, no tints. Nothing here is decorative — every line on the page is a
 * cell boundary the cutter reads values out of.
 *
 * Density comes from the layout, not from shrinking the type: measurements sit
 * in a fixed five-column table rather than one bordered card per field, which
 * is what turned a single garment into ~130mm of paper in the previous design.
 * Every field the garment defines is still printed, including the ones with no
 * value recorded — a blank slot tells the cutter the measurement was not
 * specified, which is information, where a missing row would just look like an
 * oversight.
 */
export const ProductionSlipProductCard: React.FC<ProductionSlipProductCardProps> = ({
  item,
  index,
  snapshot
}) => {
  // Shared with the customer bill so both documents read the same rules.
  const categories = garmentMeasurementBlocks(item, snapshot);

  const fabricName = (item.fabricName || '').trim();
  const fabricCode = (item.fabricCode || '').trim();
  const styleNotes = (item.styleNotes || item.notes || '').trim();
  const specialInstructions = (item.specialInstructions || '').trim();
  const itemRemarks = garmentRemarkFor(item, snapshot);

  const detailRows: { label: string; value: string }[] = [];
  if (fabricName || fabricCode) {
    detailRows.push({
      label: 'Fabric',
      value: [fabricName, fabricCode && `(${fabricCode})`].filter(Boolean).join(' ')
    });
  }
  if (styleNotes) detailRows.push({ label: 'Style / Cut', value: styleNotes });
  // Only when it says something the style line does not already say.
  if (specialInstructions && specialInstructions !== styleNotes) {
    detailRows.push({ label: 'Garment Notes', value: specialInstructions });
  }
  if (itemRemarks) detailRows.push({ label: 'Remarks', value: itemRemarks });

  return (
    <div className="production-slip-product-card border border-black break-inside-avoid">
      {/* GARMENT HEADER — the number is the cutter's index into the order,
          so it is the most prominent thing in the block. */}
      <div className="flex items-stretch border-b border-black">
        <div className="bg-black text-white font-black px-2 py-[3px] text-[12px] leading-tight flex items-center shrink-0">
          #{index + 1}
        </div>
        <div className="flex-1 flex items-center justify-between gap-2 px-2 py-[3px] min-w-0">
          <span className="font-black text-[12px] leading-tight uppercase tracking-wide truncate">
            {item.garmentType || '—'}
          </span>
          <span className="font-black text-[10px] leading-tight uppercase shrink-0">
            Qty {item.quantity || 1}
          </span>
        </div>
      </div>

      {/* PRODUCT DETAIL — label column is fixed so values line up down the block */}
      {detailRows.length > 0 && (
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '78px' }} />
            <col />
          </colgroup>
          <tbody>
            {detailRows.map(row => (
              <tr key={row.label} className="border-b border-black/30 align-top">
                <td className="px-2 py-[2px] text-[8px] font-bold uppercase tracking-wide leading-snug">
                  {row.label}
                </td>
                <td className="px-2 py-[2px] text-[9.5px] font-semibold leading-snug whitespace-pre-wrap">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MEASUREMENTS — one dense table per category the garment defines */}
      {categories.map((cat, catIdx) => {
        const cells = cat.fields;
        const rowCount = Math.ceil(cells.length / MEASUREMENT_COLUMNS);
        return (
          <div key={catIdx}>
            <div className="flex items-baseline justify-between gap-2 px-2 py-[2px] border-y border-black bg-black text-white">
              <span className="text-[8.5px] font-black uppercase tracking-wider">{cat.title}</span>
              {cat.subLabel && (
                <span className="text-[7.5px] font-semibold uppercase tracking-wide">{cat.subLabel}</span>
              )}
            </div>
            <table
              className="production-measurement-grid w-full border-collapse"
              style={{ tableLayout: 'fixed' }}
            >
              <tbody>
                {Array.from({ length: rowCount }, (_, r) => (
                  <tr key={r}>
                    {Array.from({ length: MEASUREMENT_COLUMNS }, (_, c) => {
                      const field = cells[r * MEASUREMENT_COLUMNS + c];
                      if (!field) {
                        // Pad the final row so the columns stay aligned.
                        return <td key={c} className="border border-black/30 px-1.5 py-[3px]" />;
                      }
                      const value =
                        field.value !== undefined && field.value !== null && field.value !== ''
                          ? String(field.value)
                          : '—';
                      return (
                        // Label and value share one line — stacking them cost
                        // ~2.9mm a row, which across a five-garment order was
                        // the difference between one sheet and two.
                        <td key={c} className="border border-black/30 px-1.5 py-[2px]">
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[7.5px] font-bold uppercase tracking-tight leading-none truncate">
                              {field.label}
                            </span>
                            <span className="text-[10px] font-black leading-none shrink-0">
                              {value}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
