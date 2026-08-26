import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin } from 'lucide-react';
import { Customer } from '../../types';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  initialCustomer?: Customer | null;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialCustomer
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Jalandhar');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialCustomer) {
      setName(initialCustomer.name);
      setPhone(initialCustomer.phone);
      setEmail(initialCustomer.email || '');
      setAddress(initialCustomer.address);
      setCity(initialCustomer.city || 'Jalandhar');
      setNotes(initialCustomer.notes || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCity('Jalandhar');
      setNotes('');
    }
  }, [initialCustomer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const updated: Customer = {
      id: initialCustomer ? initialCustomer.id : `CUST-${Math.floor(100 + Math.random() * 900)}`,
      name,
      phone,
      email,
      address,
      city,
      notes,
      totalOrders: initialCustomer ? initialCustomer.totalOrders : 0,
      lifetimeSpend: initialCustomer ? initialCustomer.lifetimeSpend : 0,
      lastVisitDate: new Date().toISOString().split('T')[0],
      createdDate: initialCustomer ? initialCustomer.createdDate : new Date().toISOString().split('T')[0]
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#E6E1D7] max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-3">
          <h2 className="text-lg font-bold text-[#071426] brand-font">
            {initialCustomer ? 'Edit Customer Profile' : 'Add New Customer'}
          </h2>
          <button onClick={onClose} className="p-1 text-[#8C7E6A] hover:text-[#071426]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-[#6E6454] mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hardik Nagpal"
              className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#6E6454] mb-1">Phone Number *</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#6E6454] mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. client@example.com"
              className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-[#6E6454] mb-1">Address Area</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Model Town"
                className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#6E6454] mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Jalandhar"
                className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#6E6454] mb-1">Style & Fabric Preferences</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prefers Italian soft shoulder, Super 150s Wool..."
              className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2.5 rounded-xl text-[#071426] font-medium outline-none focus:border-[#C9A24A]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#F2ECE1]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#E0D8CB] text-[#071426] font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#071426] text-[#D4AF5A] font-semibold rounded-xl hover:bg-[#0B1930]"
            >
              Save Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
