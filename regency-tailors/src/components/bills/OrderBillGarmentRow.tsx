import React from 'react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentRemarkFor } from '../../utils/garmentMeasurements';
import { BillDensityTokens } from '../../utils/orderBillLayout';

interface OrderBillGarmentRowProps {
  item: OrderItem;
  index: number; // 0-based; shown as S.No. index + 1
  snapshot: Partial<MeasurementRecord>;
  tokens: BillDensityTokens;
}

/**
 * One row of the customer bill's garment table.
 *
 * Deliberately carries no measurement of any kind — not chest, not waist, not
 * length, nothing. Measurements belong to the Production Slip only; this
 * document reads `snapshot` solely to resolve a garment's own text remark
 * (`garmentRemarks`), never a measurement field.
 *
 * The Amount cell is a blank line for the owner to write on by hand. It is
 * never populated, never computed, and carries no currency symbol.
 */
export const OrderBillGarmentRow: React.FC<OrderBillGarmentRowProps> = ({ item, index, snapshot, tokens }) => {
  const fabricName = (item.fabricName || '').trim();
  const fabricCode = (item.fabricCode || '').trim();
  const description = (item.styleNotes || item.notes || '').trim();
  const specialInstructions = (item.specialInstructions || '').trim();
  const remark = garmentRemarkFor(item, snapshot);
  const quantity = item.quantity || 1;

  const descriptionLines = [description, specialInstructions].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );

  // Density-driven sizing is applied inline rather than through utility
  // classes: the tier is chosen at runtime, and Tailwind only emits classes it
  // can see in the source at build time.
  const cell: React.CSSProperties = {
    paddingTop: tokens.rowPadY,
    paddingBottom: tokens.rowPadY,
    paddingLeft: 6,
    paddingRight: 6,
    fontSize: tokens.rowTextPx,
    lineHeight: tokens.rowLeading
  };

  return (
    <tr className="order-bill-row align-top">
      <td className="border border-[#DFD7C7] text-center font-black text-[#071426]" style={cell}>
        {index + 1}
      </td>
      <td className="border border-[#DFD7C7] font-black text-[#071426] uppercase" style={cell}>
        {item.garmentType || '—'}
      </td>
      <td className="border border-[#DFD7C7] text-[#4A5568] font-medium" style={cell}>
        {descriptionLines.length > 0 ? descriptionLines.map((l, i) => <div key={i}>{l}</div>) : '—'}
      </td>
      <td className="border border-[#DFD7C7] text-[#071426] font-semibold" style={cell}>
        {fabricName || fabricCode ? (
          <>
            {fabricName && <div>{fabricName}</div>}
            {fabricCode && <div className="text-[#7A7060] font-medium">({fabricCode})</div>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="border border-[#DFD7C7] text-center font-black text-[#071426]" style={cell}>
        {quantity}
      </td>
      <td className="border border-[#DFD7C7] text-[#4A5568] font-medium whitespace-pre-wrap" style={cell}>
        {remark || '—'}
      </td>
      {/* Amount: a blank writing line, never a value. No ₹, no digits, no fallback text.
          Vertically centred independently of the row's other cells, so the line sits in
          the middle of a tall row rather than floating near its top. */}
      <td
        className="order-bill-amount-cell border border-[#DFD7C7]"
        style={{ ...cell, verticalAlign: 'middle' }}
      >
        <span
          className="block border-b border-[#B8AC8F]"
          style={{ height: Math.max(10, tokens.rowTextPx + 3) }}
          aria-label="Amount — filled in by hand"
        />
      </td>
    </tr>
  );
};
