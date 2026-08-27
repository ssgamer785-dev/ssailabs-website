import React from 'react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentRemarkFor } from '../../utils/garmentMeasurements';

interface OrderBillGarmentRowProps {
  item: OrderItem;
  index: number; // 0-based; shown as S.No. index + 1
  snapshot: Partial<MeasurementRecord>;
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
export const OrderBillGarmentRow: React.FC<OrderBillGarmentRowProps> = ({ item, index, snapshot }) => {
  const fabricName = (item.fabricName || '').trim();
  const fabricCode = (item.fabricCode || '').trim();
  const description = (item.styleNotes || item.notes || '').trim();
  const specialInstructions = (item.specialInstructions || '').trim();
  const remark = garmentRemarkFor(item, snapshot);
  const quantity = item.quantity || 1;

  const descriptionLines = [description, specialInstructions].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );

  return (
    <tr className="order-bill-row align-top">
      <td className="border border-[#DFD7C7] px-2 py-2 text-center font-black text-[#071426] text-[10.5px]">
        {index + 1}
      </td>
      <td className="border border-[#DFD7C7] px-2 py-2 font-black text-[#071426] text-[10.5px] uppercase">
        {item.garmentType || '—'}
      </td>
      <td className="border border-[#DFD7C7] px-2 py-2 text-[#4A5568] font-medium text-[10px] leading-snug">
        {descriptionLines.length > 0 ? descriptionLines.map((l, i) => <div key={i}>{l}</div>) : '—'}
      </td>
      <td className="border border-[#DFD7C7] px-2 py-2 text-[#071426] font-semibold text-[10px] leading-snug">
        {fabricName || fabricCode ? (
          <>
            {fabricName && <div>{fabricName}</div>}
            {fabricCode && <div className="text-[#7A7060] font-medium">({fabricCode})</div>}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="border border-[#DFD7C7] px-2 py-2 text-center font-black text-[#071426] text-[10.5px]">
        {quantity}
      </td>
      <td className="border border-[#DFD7C7] px-2 py-2 text-[#4A5568] font-medium text-[10px] leading-snug whitespace-pre-wrap">
        {remark || '—'}
      </td>
      {/* Amount: a blank writing line, never a value. No ₹, no digits, no fallback text.
          Vertically centred independently of the row's other cells, so the line sits in
          the middle of a tall row rather than floating near its top. */}
      <td className="order-bill-amount-cell border border-[#DFD7C7] px-2 py-2 align-middle" style={{ verticalAlign: 'middle' }}>
        <span className="block border-b border-[#B8AC8F] h-3.5" aria-label="Amount — filled in by hand" />
      </td>
    </tr>
  );
};
