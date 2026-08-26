// No seeded business data. The showroom's own details come from the
// showroom_settings table; nothing here is invented.
import { Customer, MeasurementRecord, Order, Fitting, Worker, Invoice, Expense, TrashItem, ShowroomProfile } from '../types';

export const initialCustomers: Customer[] = [];

export const initialMeasurements: MeasurementRecord[] = [];

export const initialOrders: Order[] = [];

export const initialFittings: Fitting[] = [];

export const initialWorkers: Worker[] = [];

export const initialInvoices: Invoice[] = [];

export const initialExpenses: Expense[] = [];

export const initialTrash: TrashItem[] = [];

export const initialProfile: ShowroomProfile = {
  name: 'REGENCY TAILORS',
  subtitle: 'Bespoke Showroom & Tailoring Suite',
  city: '',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  activeUser: 'Showroom Owner',
  activeRole: 'Admin'
};
