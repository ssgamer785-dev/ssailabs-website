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
  city: 'JALANDHAR CITY SHOWROOM',
  address: '382, Model Town Market, Opposite Gymkhana Club, Jalandhar, Punjab 144003',
  phone: '+91 181 245 8899',
  email: 'concierge@regencytailors.com',
  gstin: '03AAAAA0000A1Z5',
  activeUser: 'Showroom Owner',
  activeRole: 'Admin'
};

