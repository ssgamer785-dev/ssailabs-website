import React from 'react';
import { PrintableRegencyBill, PrintableRegencyBillProps } from './PrintableRegencyBill';

export type PrintableBillProps = PrintableRegencyBillProps;
export const PrintableBill: React.FC<PrintableBillProps> = (props) => {
  return <PrintableRegencyBill {...props} />;
};

export { PrintableRegencyBill };
