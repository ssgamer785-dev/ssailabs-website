/*
 * NOT USER-REACHABLE — see PrintableRegencyBill.
 *
 * Left over from the removed legacy-invoice modal. Nothing renders it. The
 * approved customer bill is `OrderBillPage`.
 */
import React from 'react';
import { PrintableRegencyBill, PrintableRegencyBillProps } from './PrintableRegencyBill';

export type PrintableBillProps = PrintableRegencyBillProps;
export const PrintableBill: React.FC<PrintableBillProps> = (props) => {
  return <PrintableRegencyBill {...props} />;
};

export { PrintableRegencyBill };
