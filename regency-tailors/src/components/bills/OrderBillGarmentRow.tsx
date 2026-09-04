import React from 'react';
import { OrderItem, MeasurementRecord } from '../../types';
import { BillDensityTokens } from '../../utils/orderBillLayout';

interface OrderBillGarmentRowProps {
  item: OrderItem;
  index: number; // 0-based; shown as S.No. index + 1
  snapshot: Partial<MeasurementRecord>;
  tokens: BillDensityTokens;
}

/**
 * One row of the customer bill's garment table: S.No., garment, quantity, and a
 * blank line for the amount.
 *
 * Deliberately carries no measurement of any kind — not chest, not waist, not
 * length, nothing. Measurements belong to the Production Slip only.
 *
 * It carries no remark either. Remarks are workshop instructions — how the
 * cutter is to make the garment — and they belong on the slip that goes to the
 * bench, not on the customer's copy. They remain on the order and on the
 * production slip; this document simply no longer has a column for them.
 *
 * It carries no fabric or stitching description either. The showroom stopped
 * collecting them, so those columns printed an em-dash on every row of every
 * new bill — a column of placeholders reads as missing information rather
 * than as information the shop never took. The values remain in the schema for
 * orders that predate the change; this document simply no longer has a column
 * to show them in.
 *
 * The Amount cell is a blank line for the owner to write on by hand. It is
 * never populated, never computed, and carries no currency symbol.
 */
export const OrderBillGarmentRow: React.FC<OrderBillGarmentRowProps> = ({ item, index, snapshot, tokens }) => {
  const quantity = item.quantity || 1;

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
      <td className="border border-[#DFD7C7] text-center font-black text-[#071426]" style={cell}>
        {quantity}
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
