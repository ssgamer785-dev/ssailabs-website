/*
 * NOT USER-REACHABLE — see PrintableRegencyBill.
 *
 * Left over from the removed legacy-invoice modal. Nothing renders it. The
 * approved customer bill is `OrderBillPage`.
 */
import React from 'react';
import { Order } from '../../types';
import { PrintableRegencyBill } from './PrintableRegencyBill';

export interface BillExportCanvasProps {
  order: Order | null;
  id?: string;
}

/**
 * Dedicated Standalone A4 Export Canvas for Regency Tailor Bill.
 * 
 * Sized to standard A4 (210mm × 297mm or 794px × 1123px at 96 DPI / 2480px × 3508px at 300 DPI)
 * Contains the complete bill from top gold flourish border to bottom navy footer,
 * perfectly centered with equal margins, completely independent of browser viewport,
 * modal dialogs, or scrolling containers.
 */
export const BillExportCanvas: React.FC<BillExportCanvasProps> = ({
  order,
  id = 'bill-export-canvas'
}) => {
  return (
    <div
      id={id}
      data-export-canvas="true"
      className="bill-export-a4-root"
      style={{
        width: '794px',
        minWidth: '794px',
        maxWidth: '794px',
        minHeight: '1123px',
        backgroundColor: '#FAF7F0',
        padding: '16px 18px', // ~5-6mm safe page margin
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        margin: '0 auto',
        position: 'relative',
        fontFamily: "'Manrope', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      <div 
        style={{ 
          width: '100%', 
          maxWidth: '754px', 
          boxSizing: 'border-box' 
        }}
      >
        <PrintableRegencyBill order={order} id={`${id}-inner`} />
      </div>
    </div>
  );
};
