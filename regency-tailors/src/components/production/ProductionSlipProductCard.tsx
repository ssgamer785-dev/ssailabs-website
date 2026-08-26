import React from 'react';
import { Scissors } from 'lucide-react';
import { OrderItem, MeasurementRecord } from '../../types';

interface ProductionSlipProductCardProps {
  item: OrderItem;
  index: number; // 0-indexed, display as #{index + 1}
  snapshot: Partial<MeasurementRecord>;
}

interface MeasurementField {
  label: string;
  value?: string | number;
  colSpan?: boolean;
}

interface MeasurementCategory {
  title: string;
  subLabel?: string;
  fields: MeasurementField[];
}

export const ProductionSlipProductCard: React.FC<ProductionSlipProductCardProps> = ({
  item,
  index,
  snapshot
}) => {
  const gType = (item.garmentType || '').toLowerCase().trim();

  // Determine which measurement categories apply for this product
  const categories: MeasurementCategory[] = [];

  const isSuit = gType.includes('suit');
  const isCoat = gType.includes('coat') || gType.includes('blazer') || gType.includes('jacket') || 
                 gType.includes('sherwani') || gType.includes('bandhgala') || gType.includes('tuxedo') || 
                 gType.includes('safari') || isSuit;

  const isPant = gType.includes('pant') || gType.includes('trouser') || gType.includes('slack') || 
                 gType.includes('chino') || isSuit;

  const isShirt = gType.includes('shirt');

  const isKurta = gType.includes('kurta');
  const isPajama = gType.includes('pajama') || gType.includes('pyjama') || gType.includes('salwar') || 
                   gType.includes('churidar') || gType.includes('dhoti') || (isKurta && (gType.includes('pajama') || gType.includes('pyjama') || gType.includes('set')));

  // 1. Coat measurements (Coat / Blazer / Sherwani / Bandhgala / Tuxedo / Suit / Full Coat Pant)
  if (isCoat && !isKurta && !isShirt) {
    categories.push({
      title: 'COAT MEASUREMENTS',
      subLabel: 'Jacket / Blazer / Suit',
      fields: [
        { label: 'Length', value: snapshot.coat?.length ?? snapshot.jacket?.jacketLength },
        { label: 'Chest', value: snapshot.coat?.chest ?? snapshot.jacket?.chest },
        { label: 'Stomach', value: snapshot.coat?.stomach ?? snapshot.jacket?.waist },
        { label: 'H.P. / Hip', value: snapshot.coat?.hip ?? snapshot.jacket?.hip },
        { label: 'Shoulder', value: snapshot.coat?.shoulder ?? snapshot.jacket?.shoulderWidth },
        { label: 'Sleeve', value: snapshot.coat?.sleeve ?? snapshot.jacket?.sleeveLength },
        { label: 'X-Back', value: snapshot.coat?.xBack ?? snapshot.jacket?.crossBack },
        { label: 'Collar', value: snapshot.coat?.collar },
        { label: 'Jacket Length', value: snapshot.coat?.jacketLength },
        { label: 'Waistcoat Length', value: snapshot.coat?.waistcoatLength }
      ]
    });
  }

  // 2. Pant measurements (Trousers / Pant / Suit / Full Coat Pant)
  if (isPant && !isKurta && !isShirt) {
    categories.push({
      title: 'PANT MEASUREMENTS',
      subLabel: 'Trouser / Slacks',
      fields: [
        { label: 'Length', value: snapshot.pant?.length ?? snapshot.trouser?.outseam },
        { label: 'Waist', value: snapshot.pant?.waist ?? snapshot.trouser?.waist },
        { label: 'H.P. / Hip', value: snapshot.pant?.hip ?? snapshot.trouser?.hip },
        { label: 'Thigh', value: snapshot.pant?.thigh ?? snapshot.trouser?.thigh },
        { label: 'In-Leg', value: snapshot.pant?.inLeg ?? snapshot.trouser?.inseam },
        { label: 'Bottom', value: snapshot.pant?.bottom ?? snapshot.trouser?.bottomOpening },
        { label: 'Body', value: snapshot.pant?.body ?? snapshot.trouser?.rise, colSpan: true }
      ]
    });
  }

  // 3. Shirt measurements (Bespoke Shirt / Casual Shirt)
  if (isShirt) {
    categories.push({
      title: 'SHIRT MEASUREMENTS',
      subLabel: 'Bespoke Dress Shirt',
      fields: [
        { label: 'Length', value: snapshot.shirt?.length },
        { label: 'Chest', value: snapshot.shirt?.chest },
        { label: 'Stomach', value: snapshot.shirt?.stomach },
        { label: 'H.P. / Hip', value: snapshot.shirt?.hip },
        { label: 'Shoulder', value: snapshot.shirt?.shoulder },
        { label: 'Sleeve', value: snapshot.shirt?.sleeve },
        { label: 'Collar', value: snapshot.shirt?.collar },
        { label: 'Cuff', value: snapshot.shirt?.cuff }
      ]
    });
  }

  // 4. Kurta measurements
  if (isKurta) {
    categories.push({
      title: 'KURTA MEASUREMENTS',
      subLabel: 'Ethnic Kurta',
      fields: [
        { label: 'Length', value: snapshot.kurta?.length },
        { label: 'Chest', value: snapshot.kurta?.chest },
        { label: 'Stomach', value: snapshot.kurta?.stomach },
        { label: 'H.P. / Hip', value: snapshot.kurta?.hip },
        { label: 'Shoulder', value: snapshot.kurta?.shoulder },
        { label: 'Sleeve', value: snapshot.kurta?.sleeve },
        { label: 'Bicep', value: snapshot.kurta?.bicep },
        { label: 'Cuff', value: snapshot.kurta?.cuff },
        { label: 'Collar', value: snapshot.kurta?.collar }
      ]
    });
  }

  // 5. Pajama measurements
  if (isPajama) {
    categories.push({
      title: 'PAJAMA MEASUREMENTS',
      subLabel: 'Churidar / Salwar',
      fields: [
        { label: 'Length', value: snapshot.pajama?.length },
        { label: 'Waist', value: snapshot.pajama?.waist },
        { label: 'H.P. / Hip', value: snapshot.pajama?.hip },
        { label: 'Thigh', value: snapshot.pajama?.thigh },
        { label: 'In-Leg', value: snapshot.pajama?.inLeg },
        { label: 'Bottom', value: snapshot.pajama?.bottom },
        { label: 'Body', value: snapshot.pajama?.body, colSpan: true }
      ]
    });
  }

  // Fallback if no specific category matched
  if (categories.length === 0) {
    categories.push({
      title: `${(item.garmentType || 'GARMENT').toUpperCase()} MEASUREMENTS`,
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

  const hasFabric = Boolean(item.fabricName || item.fabricCode);
  const hasStyle = Boolean(item.styleNotes || item.notes);
  const hasSpecial = Boolean(item.specialInstructions);

  const itemRemarks = (
    item.remarks ||
    snapshot.garmentRemarks?.[item.garmentType] ||
    (item.garmentType.toLowerCase().includes('coat') && snapshot.garmentRemarks?.['Coat']) ||
    (item.garmentType.toLowerCase().includes('shirt') && snapshot.garmentRemarks?.['Shirt']) ||
    (item.garmentType.toLowerCase().includes('kurta') && snapshot.garmentRemarks?.['Kurta Pajama']) ||
    ''
  ).trim();

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
