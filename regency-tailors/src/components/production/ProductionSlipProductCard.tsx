import React from 'react';
import { Scissors } from 'lucide-react';
import { OrderItem, MeasurementRecord } from '../../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from '../../utils/garmentMeasurements';

interface ProductionSlipProductCardProps {
  item: OrderItem;
  index: number; // 0-indexed, display as #{index + 1}
  snapshot: Partial<MeasurementRecord>;
}

export const ProductionSlipProductCard: React.FC<ProductionSlipProductCardProps> = ({
  item,
  index,
  snapshot
}) => {
  // Shared with the customer bill so both documents read the same rules.
  const categories = garmentMeasurementBlocks(item, snapshot);

  const hasFabric = Boolean(item.fabricName || item.fabricCode);
  const hasStyle = Boolean(item.styleNotes || item.notes);
  const hasSpecial = Boolean(item.specialInstructions);

  const itemRemarks = garmentRemarkFor(item, snapshot);

  return (
    <div className="p-4 sm:p-5 bg-white border-2 border-[#E0D8CB] rounded-2xl space-y-4 shadow-xs production-slip-product-card break-inside-avoid">
      {/* 1. Header: Sequential Hashtag Badge + Product Name + Qty */}
      <div className="flex items-center justify-between gap-3 border-b border-[#E6E1D7] pb-3">
        <div className="flex items-center gap-3">
          {/* Automatic Sequential Hashtag Badge */}
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-[#071426] text-[#D4AF5A] font-black text-xs sm:text-sm tracking-wider font-mono shadow-xs border border-[#C9A24A]/40 shrink-0">
            #{index + 1}
          </span>
          <h3 className="font-extrabold text-sm sm:text-base text-[#071426] uppercase tracking-wide">
            {item.garmentType}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 bg-[#FAF8F5] text-[#071426] text-xs font-black rounded-lg border border-[#E0D8CB]">
            Qty: {item.quantity || 1}
          </span>
        </div>
      </div>

      {/* 2. Product Details (Fabric, Styling / Cut, Special Notes) */}
      {(hasFabric || hasStyle || hasSpecial) && (
        <div className="production-slip-detail-grid grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-[#FAF8F5] p-3 rounded-xl border border-[#E0D8CB]">
          {hasFabric && (
            <div className="text-[#071426]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Fabric</span>
              <span className="font-bold">{item.fabricName || '—'}</span>
              {item.fabricCode && <span className="text-[#7A7060] font-medium ml-1">({item.fabricCode})</span>}
            </div>
          )}

          {hasStyle && (
            <div className="text-[#071426]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Styling / Cut</span>
              <span className="font-medium italic">{item.styleNotes || item.notes}</span>
            </div>
          )}

          {hasSpecial && (
            <div className="col-span-full text-[#071426]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Garment Notes</span>
              <span className="font-medium">{item.specialInstructions}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Measurements Section Heading */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
          <h4 className="text-xs font-black tracking-wider text-[#071426] uppercase flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5 text-[#C9A24A]" />
            <span>MEASUREMENTS</span>
          </h4>
          <span className="text-[10px] font-bold text-[#8C7E6A] uppercase">
            Unit: {snapshot.unit || 'Inches'} {snapshot.fitPreference ? `• Fit: ${snapshot.fitPreference}` : ''}
          </span>
        </div>

        {/* 4. Product-Specific Measurement Tables */}
        <div className="space-y-3">
          {categories.map((cat, catIdx) => (
            <div key={catIdx} className="border border-[#E0D8CB] rounded-xl overflow-hidden bg-white">
              <div className="bg-[#071426] text-[#D4AF5A] px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex justify-between items-center">
                <span>{cat.title}</span>
                {cat.subLabel && <span className="text-[10px] text-[#A39682] font-semibold">{cat.subLabel}</span>}
              </div>

              <div className="production-measurement-grid p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                {cat.fields.map((f, fIdx) => (
                  <div
                    key={fIdx}
                    className={`p-1.5 bg-[#FAF8F5] rounded-lg border border-[#E6E1D7] flex flex-col justify-between ${
                      f.colSpan ? 'col-span-2 sm:col-span-1' : ''
                    }`}
                  >
                    <span className="text-[10px] text-[#8C7E6A] font-bold block">{f.label}</span>
                    <span className="font-black text-sm text-[#071426] mt-0.5">
                      {f.value !== undefined && f.value !== null && f.value !== '' ? f.value : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 5. PER-GARMENT REMARKS (DIRECTLY BELOW MEASUREMENTS) */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-[#8C7E6A] uppercase tracking-wider">
              REMARKS
            </span>
          </div>

          {itemRemarks ? (
            <div className="w-full bg-[#FAF8F5] border-2 border-[#E0D8CB] rounded-xl p-3.5 text-xs font-bold text-[#071426] leading-relaxed whitespace-pre-wrap shadow-2xs">
              {itemRemarks}
            </div>
          ) : (
            <div 
              className="w-full bg-[#FAF8F5]/70 border-2 border-dashed border-[#C9A24A]/40 rounded-xl min-h-[60px] p-2.5 flex items-center justify-center"
              aria-label="Blank production remarks space"
            >
              <span className="text-[10px] font-bold text-[#A39682] uppercase tracking-wider opacity-60">
                Workshop Remarks & Adjustments Space
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
