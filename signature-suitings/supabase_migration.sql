-- =====================================================================
-- DATABASE MIGRATION - SIGNATURE SUITINGS SHOWROOM
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO UPDATE THE TABLES
-- =====================================================================

-- 1. Add "photoUrl" column to the existing users table if it does not already exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS "photoUrl" text;

-- 2. Add Fitting, Trials & Financial tracking columns to the existing appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "orderId" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentType" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "appointmentTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "trialCharge" numeric;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "paymentStatus" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "linkedInvoiceId" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "clothDropOffDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "fittingPickupDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "pickupDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "pickupTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "readyDate" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "readyTime" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "trialStatus" text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "completedStatus" text;

-- 3. Add link connection to existing invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "linkedAppointmentId" text;

-- 4. Add missing columns to existing workers table
ALTER TABLE workers ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS "photoUrl" text;


