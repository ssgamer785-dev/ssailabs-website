export type GarmentType = 
  | 'Full Coat Pant'
  | 'Coat'
  | 'Pant'
  | 'Shirt'
  | 'Kurta Pajama'
  | '3-Piece Suit'
  | '2-Piece Suit'
  | 'Sherwani'
  | 'Tuxedo'
  | 'Blazer'
  | 'Bespoke Shirt'
  | 'Trousers'
  | 'Bandhgala';

export type ProductionStatus = 
  | 'New'
  | 'In Production'
  | 'Ready'
  | 'Completed';

export type OrderStatus = 
  | 'New'
  | 'Measurement Taken'
  | 'Fabric Cutting'
  | 'Master Stitching'
  | 'First Trial'
  | 'Final Fitting'
  | 'Ready for Pickup'
  | 'Delivered';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  totalOrders: number;
  lifetimeSpend: number;
  lastVisitDate: string;
  notes?: string;
  createdDate: string;
}

export interface CoatMeasurement {
  length?: number | string;
  chest?: number | string;
  stomach?: number | string;
  hip?: number | string;
  shoulder?: number | string;
  sleeve?: number | string;
  xBack?: number | string;
  collar?: number | string;
  jacketLength?: number | string;
  waistcoatLength?: number | string;
}

export interface PantMeasurement {
  length?: number | string;
  waist?: number | string;
  hip?: number | string;
  thigh?: number | string;
  inLeg?: number | string;
  bottom?: number | string;
  body?: number | string;
}

export interface ShirtMeasurement {
  length?: number | string;
  chest?: number | string;
  stomach?: number | string;
  hip?: number | string;
  shoulder?: number | string;
  sleeve?: number | string;
  collar?: number | string;
  cuff?: number | string;
}

export interface KurtaMeasurement {
  length?: number | string;
  chest?: number | string;
  stomach?: number | string;
  hip?: number | string;
  shoulder?: number | string;
  sleeve?: number | string;
  bicep?: number | string;
  cuff?: number | string;
  collar?: number | string;
}

export interface PajamaMeasurement {
  length?: number | string;
  waist?: number | string;
  hip?: number | string;
  thigh?: number | string;
  inLeg?: number | string;
  bottom?: number | string;
  body?: number | string;
}

export interface JacketMeasurement {
  chest: number;
  waist: number;
  hip: number;
  shoulderWidth: number;
  sleeveLength: number;
  jacketLength: number;
  neck?: number;
  crossFront?: number;
  crossBack?: number;
  armhole?: number;
  bicep?: number;
}

export interface TrouserMeasurement {
  waist: number;
  hip: number;
  inseam: number;
  outseam: number;
  thigh: number;
  knee?: number;
  bottomOpening: number;
  rise?: number;
}

export interface MeasurementRecord {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  orderNumber?: string;
  garmentType: GarmentType | string;
  selectedGarments?: string[];
  unit?: 'inches' | 'cm';
  coat?: CoatMeasurement;
  pant?: PantMeasurement;
  shirt?: ShirtMeasurement;
  kurta?: KurtaMeasurement;
  pajama?: PajamaMeasurement;
  jacket?: JacketMeasurement;
  trouser?: TrouserMeasurement;
  fitPreference?: 'Slim Fit' | 'Italian Cut' | 'Classic Tailored' | 'Structured Shoulder' | 'Soft Shoulder' | string;
  postureNotes?: string;
  fittingNotes?: string;
  garmentRemarks?: Record<string, string>;
  lastUpdated: string;
}

export interface OrderPayment {
  id: string;
  date: string;
  amount: number;
  method: 'Cash' | 'UPI / GPay' | 'Card' | 'NetBanking' | string;
  note?: string;
}

export interface OrderItem {
  id: string;
  garmentType: GarmentType | string;
  fabricCode: string;
  fabricName: string;
  notes: string;
  price: number;
  quantity?: number;
  styleNotes?: string;
  specialInstructions?: string;
  remarks?: string;
}

export interface Order {
  id: string; // the showroom-facing order number, e.g. "1"
  orderNumber?: string;
  /** Database primary key. Absent on the browser-storage path. */
  dbId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  items: OrderItem[];
  orderDate: string;
  trialDate: string;
  trialTime?: string;
  trialRequired?: boolean;
  trialCharge?: number;
  deliveryDate: string;
  deliveryTime?: string;
  deliveryType?: 'Showroom Pickup' | 'Home Delivery' | 'Express Courier' | string;
  status: OrderStatus;
  productionStatus?: ProductionStatus;
  productionNotes?: string;
  priority?: 'Normal' | 'Urgent' | 'VIP Express';
  salesperson?: string;
  specialInstructions?: string;
  fittingNotes?: string;
  totalAmount: number;
  subtotal?: number;
  discount?: number;
  taxAmount?: number;
  advancePaid: number;
  balanceDue: number;
  urgent: boolean;
  notes?: string;
  measurementsSnapshot?: Partial<MeasurementRecord>;
  paymentMethod?: string;
  paymentHistory?: OrderPayment[];
  fittingId?: string;
  invoiceId?: string;
}

export interface Fitting {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  garment: string;
  trialStage: 'First Trial' | 'Second Trial' | 'Final Polish';
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Completed' | 'Re-Trial Needed' | 'Cancelled';
  adjustmentNotes: string;
}

export interface Worker {
  id: string;
  name: string;
  role: 'Master Cutter' | 'Coat Specialist' | 'Trouser Specialist' | 'Embroidery Artisan' | 'Finishing Presser';
  phone: string;
  type: 'Piece-Rate' | 'Monthly Salary';
  ratePerGarment: number;
  monthlySalary: number;
  garmentsCompletedThisMonth: number;
  totalEarned: number;
  advanceTaken: number;
  balancePayout: number;
  status: 'Active' | 'On Leave';
}

export interface InvoiceItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string; // e.g., "INV-REG-1042"
  orderId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  gstAmount: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  balanceRemaining: number;
  paymentMode: 'Cash' | 'UPI / GPay' | 'Card' | 'NetBanking';
  status: 'Paid' | 'Partial' | 'Outstanding';
}

export interface Expense {
  id: string;
  date: string;
  category: 'Fabric Inventory' | 'Linings & Canvas' | 'Staff Wages' | 'Showroom Utilities' | 'Equipment & Maintenance' | 'Misc';
  description: string;
  amount: number;
  paidTo: string;
}

export interface TrashItem {
  id: string;
  itemType: 'Customer' | 'Order' | 'Measurement' | 'Worker';
  title: string;
  originalData: any;
  deletedAt: string;
  deletedBy: string;
}

export interface ShowroomProfile {
  name: string;
  subtitle: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  activeUser: string;
  activeRole: 'Admin';
}
