import React from 'react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from '../../utils/garmentMeasurements';
import { SlipDensityTokens, slipDensityTokens } from '../../utils/productionSlipLayout';

interface ProductionSlipProductCardProps {
  item: OrderItem;
  /**
   * The customer's order number, printed on every garment of the slip.
   *
   * Not the garment's position: a workshop bench holds work from several
   * orders at once, so the number a cutter needs on each piece is the one that
   * says which order it belongs to. All four garments of order 15 read #15.
   */
  orderNumber: string;
  snapshot: Partial<MeasurementRecord>;
  /** Resolved by the sheet's measured auto-fit; defaults to the floor tier. */
  tokens?: SlipDensityTokens;
}

/** Measurement cells per row. Five keeps the longest label ("Waistcoat Length")
 *  on one line at A4 width while still packing ten coat fields into two rows. */
const MEASUREMENT_COLUMNS = 5;

/**
 * One garment on the workshop production slip.
 *
 * Deliberately narrow: a cutter needs the garment, its measurements and the
 * remark written against it. Fabric, style/cut and garment notes are not
 * printed here — the showroom stopped collecting them, and a column of empty
 * labels is worse than no column at all.
 *
 * Order on the page is fixed and matters:
 *     #ORDER-NO GARMENT  ->  MEASUREMENTS  ->  REMARKS / INSTRUCTIONS
 *
 * Built for a black-and-white laser printer: black rules, black text, white
 * paper, no tints. Density comes from the layout, not from shrinking the type:
 * measurements sit in a fixed five-column table rather than one bordered card
 * per field. Every field the garment defines is printed, including the ones
 * with no value recorded — a blank slot tells the cutter the measurement was
 * not specified, which is information, where a missing row would just look
 * like an oversight.
 *
 * Type sizes and padding come from the tier the sheet's auto-fit settled on,
 * so a short order spends its spare paper on larger numbers instead of leaving
 * the bottom third of the sheet blank.
 */
export const ProductionSlipProductCard: React.FC<ProductionSlipProductCardProps> = ({
  item,
  orderNumber,
  snapshot,
  tokens = slipDensityTokens('dense')
}) => {
  // Shared with the customer bill so both documents read the same rules.
  const categories = garmentMeasurementBlocks(item, snapshot);
  const itemRemarks = garmentRemarkFor(item, snapshot);

  return (
    <div className="production-slip-product-card border border-black break-inside-avoid">
      {/* 1. GARMENT HEADER — the number is the customer's order number, the
             same one on the sheet's header and on the customer bill. Every
             garment of an order carries it, so a piece separated from the rest
             on the bench can still be traced back to the order it belongs to. */}
      <div className="flex items-stretch border-b border-black">
        <div
          className="bg-black text-white font-black px-2 leading-tight flex items-center shrink-0"
          style={{ fontSize: `${tokens.headPx}px`, paddingTop: tokens.headPadY, paddingBottom: tokens.headPadY }}
        >
          #{orderNumber || '—'}
        </div>
        <div
          className="flex-1 flex items-center justify-between gap-2 px-2 min-w-0"
          style={{ paddingTop: tokens.headPadY, paddingBottom: tokens.headPadY }}
        >
          <span
            className="font-black leading-tight uppercase tracking-wide truncate"
            style={{ fontSize: `${tokens.headPx}px` }}
          >
            {item.garmentType || '—'}
          </span>
          <span
            className="font-black leading-tight uppercase shrink-0"
            style={{ fontSize: `${tokens.qtyPx}px` }}
          >
            Qty {item.quantity || 1}
          </span>
        </div>
      </div>

      {/* 2. MEASUREMENTS — one dense table per category the garment defines */}
      {categories.map((cat, catIdx) => {
        const cells = cat.fields;
        const rowCount = Math.ceil(cells.length / MEASUREMENT_COLUMNS);
        return (
          <div key={catIdx}>
            <div
              className="flex items-baseline justify-between gap-2 px-2 border-b border-black bg-black text-white"
              style={{ paddingTop: tokens.catPadY, paddingBottom: tokens.catPadY }}
            >
              <span
                className="font-black uppercase tracking-wider"
                style={{ fontSize: `${tokens.catPx}px` }}
              >
                {cat.title}
              </span>
              {cat.subLabel && (
                <span
                  className="font-semibold uppercase tracking-wide"
                  style={{ fontSize: `${tokens.catSubPx}px` }}
                >
                  {cat.subLabel}
                </span>
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
                      const pad = { paddingTop: tokens.cellPadY, paddingBottom: tokens.cellPadY };
                      if (!field) {
                        // Pad the final row so the columns stay aligned.
                        return (
                          <td key={c} className="border border-black/30 px-1.5" style={pad} />
                        );
                      }
                      const value =
                        field.value !== undefined && field.value !== null && field.value !== ''
                          ? String(field.value)
                          : '—';
                      return (
                        // Label and value share one line — stacking them cost
                        // ~2.9mm a row, which across a five-garment order was
                        // the difference between one sheet and two.
                        <td key={c} className="border border-black/30 px-1.5" style={pad}>
                          <div className="flex items-baseline justify-between gap-1">
                            <span
                              className="font-bold uppercase tracking-tight leading-none truncate"
                              style={{ fontSize: `${tokens.labelPx}px` }}
                            >
                              {field.label}
                            </span>
                            <span
                              className="font-black leading-none shrink-0"
                              style={{ fontSize: `${tokens.valuePx}px` }}
                            >
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

      {/* 3. REMARKS / INSTRUCTIONS — the garment's own remark, printed under
             its measurements. When none was recorded the label still prints
             with a single ruled line, so the workshop has somewhere to write
             an adjustment by hand without the block growing a whole box. */}
      <div className="flex items-stretch border-t border-black">
        <div
          className="px-2 font-bold uppercase tracking-wide shrink-0 border-r border-black/30 flex items-center"
          style={{
            fontSize: `${tokens.remarkLabelPx}px`,
            paddingTop: tokens.remarkPadY,
            paddingBottom: tokens.remarkPadY
          }}
        >
          Remarks
        </div>
        <div
          className="flex-1 px-2 min-w-0"
          style={{ paddingTop: tokens.remarkPadY, paddingBottom: tokens.remarkPadY }}
        >
          {itemRemarks ? (
            <span
              className="block font-semibold leading-snug whitespace-pre-wrap"
              style={{ fontSize: `${tokens.remarkPx}px` }}
            >
              {itemRemarks}
            </span>
          ) : (
            // Sized by its own line box rather than an explicit height: the
            // print stylesheet forces `height: auto` on every descendant of
            // the print root, which would collapse a set height to nothing and
            // lose the rule the workshop writes on.
            <span
              className="block border-b border-black/40 leading-none"
              style={{ fontSize: `${tokens.remarkRulePx}px` }}
              aria-label="Workshop adjustment space"
            >
              &nbsp;
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
