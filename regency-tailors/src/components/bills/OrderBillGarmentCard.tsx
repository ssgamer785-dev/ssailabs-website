import React from 'react';
import { Scissors } from 'lucide-react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from '../../utils/garmentMeasurements';

interface OrderBillGarmentCardProps {
  item: OrderItem;
  index: number; // 0-based; shown as #1..#n
  snapshot: Partial<MeasurementRecord>;
}

/**
 * One garment on the customer bill: what was ordered, in what fabric, cut how,
 * with the measurements taken for it.
 *
 * There is no price, rate or line value here — not hidden, not blank, simply
 * not part of the document. The owner writes the amount on the printed sheet.
 */
export const OrderBillGarmentCard: React.FC<OrderBillGarmentCardProps> = ({ item, index, snapshot }) => {
  const blocks = garmentMeasurementBlocks(item, snapshot);
  const remark = garmentRemarkFor(item, snapshot);

  const fabricName = (item.fabricName || '').trim();
  const fabricCode = (item.fabricCode || '').trim();
  const styling = (item.styleNotes || item.notes || '').trim();
  const garmentNote = (item.specialInstructions || '').trim();
  const quantity = item.quantity || 1;

  const detail = (label: string, value: string) => (
    <div>
      <span className="block text-[8.5px] font-bold text-[#8C7E6A] uppercase tracking-wider">{label}</span>
      <span className="block text-[10.5px] font-bold text-[#071426] leading-snug">{value}</span>
    </div>
  );

  return (
    <div
      className="order-bill-garment-card border border-[#DFD7C7] rounded-xl overflow-hidden bg-white break-inside-avoid"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Garment heading */}
      <div className="flex items-center justify-between gap-2 bg-[#FAF7F0] border-b border-[#E8E0D2] px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#071426] text-[#D4AF5A] font-black text-[10px] font-mono shrink-0 border border-[#C9A24A]/40">
            {index + 1}
          </span>
          <h3 className="text-[12.5px] font-black text-[#071426] uppercase tracking-wide truncate">
            {item.garmentType}
          </h3>
        </div>
        <span className="text-[10px] font-black text-[#071426] bg-white border border-[#DFD7C7] rounded-md px-2 py-0.5 shrink-0">
          QTY {quantity}
        </span>
      </div>

      {/* Fabric, code and cut — only fields the showroom actually recorded */}
      {(fabricName || fabricCode || styling || garmentNote) && (
        <div
          className="px-3 py-2 border-b border-[#EFE9DD]"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '12px', rowGap: '6px' }}
        >
          {fabricName && detail('Fabric', fabricName)}
          {fabricCode && detail('Fabric Code', fabricCode)}
          {styling && detail('Styling / Cut', styling)}
          {garmentNote && detail('Garment Note', garmentNote)}
        </div>
      )}

      {/* Measurements for this garment */}
      <div className="px-3 py-2 space-y-2">
        {blocks.map((block, blockIdx) => (
          <div key={blockIdx} className="border border-[#E8E0D2] rounded-lg overflow-hidden">
            <div className="bg-[#071426] text-[#D4AF5A] px-2.5 py-1 flex items-center justify-between">
              <span className="text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Scissors className="w-2.5 h-2.5" />
                {block.title}
              </span>
              {block.subLabel && (
                <span className="text-[8px] text-[#A39682] font-semibold uppercase">{block.subLabel}</span>
              )}
            </div>
            <div
              className="p-2 order-bill-measurement-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: '5px'
              }}
            >
              {block.fields.map((field, fieldIdx) => {
                const hasValue = field.value !== undefined && field.value !== null && field.value !== '';
                return (
                  <div
                    key={fieldIdx}
                    className="px-1.5 py-1 bg-[#FAF8F5] rounded-md border border-[#E8E0D2]"
                    style={{ boxSizing: 'border-box' }}
                  >
                    <span className="block text-[8px] text-[#8C7E6A] font-bold leading-tight">{field.label}</span>
                    <span className={`block text-[11px] font-black leading-tight ${hasValue ? 'text-[#071426]' : 'text-[#C4BBA8]'}`}>
                      {hasValue ? field.value : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* This garment's own remark */}
      {remark && (
        <div className="px-3 pb-2.5">
          <span className="block text-[8.5px] font-black text-[#8C7E6A] uppercase tracking-wider mb-1">
            Remarks
          </span>
          <p className="text-[10.5px] font-semibold text-[#071426] leading-relaxed whitespace-pre-wrap bg-[#FAF7F0] border border-[#E8E0D2] rounded-lg px-2.5 py-1.5 m-0">
            {remark}
          </p>
        </div>
      )}
    </div>
  );
};
