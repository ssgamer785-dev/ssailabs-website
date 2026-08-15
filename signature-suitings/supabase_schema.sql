-- =====================================================================
-- SIGNATURE SUITINGS SHOWROOM - COMPLETE SUPABASE POSTGRESQL SCHEMA
-- Place this in the SQL Editor of your Supabase Project to generate tables,
-- enable Row Level Security (RLS), and configure Storage.
-- =====================================================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- 1. CONFIG TABLE (Shop settings)
create table if not exists config (
    id text primary key default 'global_config',
    "shopName" text not null,
    tagline text,
    address text,
    phone1 text,
    phone2 text,
    "logoUrl" text,
    "gstEnabled" boolean default false,
    "gstNumber" text,
    "gstPercent" numeric default 18,
    "currencySymbol" text default '₹',
    "garmentTypesConfig" jsonb default '[]'::jsonb,
    "measurementFieldsConfig" jsonb default '{}'::jsonb,
    updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. USERS TABLE
create table if not exists users (
    id text primary key,
    name text not null,
    role text not null check (role in ('Admin', 'Staff')),
    email text,
    phone text,
    active boolean default true,
    "photoUrl" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. CUSTOMERS TABLE
create table if not exists customers (
    id text primary key,
    "fullName" text not null,
    "mobileNumber" text not null,
    "alternateNumber" text,
    address text,
    email text,
    dob text,
    "preferredFabricBrands" jsonb default '[]'::jsonb,
    "generalNotes" text,
    "customerSince" text not null,
    "totalOrdersCount" integer default 0,
    "outstandingBalance" numeric default 0,
    "qrCodeId" text unique not null,
    "photoUrl" text,
    "memoryNotes" jsonb default '[]'::jsonb,
    "preferenceTags" jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. MEASUREMENTS TABLE
create table if not exists measurements (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "versionDate" text not null,
    "slipNumber" text not null,
    "tryOnDate" text,
    "deliveryDate" text,
    "coatIndoWestern" jsonb default '{}'::jsonb,
    pent jsonb default '{}'::jsonb,
    vest jsonb default '{}'::jsonb,
    "shirtKurta" jsonb default '{}'::jsonb,
    "designNotes" text,
    "fabricSelected" text,
    "liningChoice" text,
    remarks text,
    "createdBy" text,
    "changesSincePrevious" jsonb default '[]'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. ORDERS TABLE
create table if not exists orders (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "orderNumber" text unique not null,
    "orderDate" text not null,
    "garmentTypes" jsonb default '[]'::jsonb,
    "linkedMeasurementVersionId" text references measurements(id) on delete set null,
    "fabricDetails" text,
    "expectedDeliveryDate" text not null,
    "actualDeliveryDate" text,
    status text not null,
    "statusHistory" jsonb default '[]'::jsonb,
    "assignedTailor" text,
    "linkedInvoiceId" text,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. TRIALS TABLE
create table if not exists trials (
    id text primary key,
    "orderId" text not null references orders(id) on delete cascade,
    "customerId" text not null references customers(id) on delete cascade,
    "trialDate" text not null,
    feedback text,
    "alterationRequired" boolean default false,
    "conductedBy" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 7. ALTERATIONS TABLE
create table if not exists alterations (
    id text primary key,
    "orderId" text not null references orders(id) on delete cascade,
    "customerId" text not null references customers(id) on delete cascade,
    "alterationDate" text not null,
    description text not null,
    "beforeNotes" text,
    "afterNotes" text,
    "handledBy" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 8. INVOICES TABLE
create table if not exists invoices (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    "invoiceNumber" text unique not null,
    "invoiceDate" text not null,
    "linkedOrderId" text references orders(id) on delete set null,
    "lineItems" jsonb default '[]'::jsonb,
    subtotal numeric default 0,
    discount numeric default 0,
    "taxPercent" numeric default 18,
    "taxAmount" numeric default 0,
    "grandTotal" numeric default 0,
    "advancePaid" numeric default 0,
    "balanceDue" numeric default 0,
    "paymentStatus" text not null,
    payments jsonb default '[]'::jsonb,
    "linkedAppointmentId" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9. APPOINTMENTS TABLE
create table if not exists appointments (
    id text primary key,
    "customerId" text not null references customers(id) on delete cascade,
    type text not null,
    "dateTime" text not null,
    status text not null,
    notes text,
    "orderId" text,
    "appointmentType" text,
    "appointmentDate" text,
    "appointmentTime" text,
    "trialCharge" numeric,
    "paymentStatus" text,
    "linkedInvoiceId" text,
    "clothDropOffDate" text,
    "fittingPickupDate" text,
    "pickupDate" text,
    "pickupTime" text,
    "readyDate" text,
    "readyTime" text,
    "trialStatus" text,
    "completedStatus" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 10. EXPENSES TABLE
create table if not exists expenses (
    id text primary key,
    category text not null,
    amount numeric not null,
    date text not null,
    notes text,
    supplier text,
    "paymentMethod" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 11. WORKERS TABLE
create table if not exists workers (
    id text primary key,
    name text not null,
    "mobileNumber" text not null,
    address text,
    role text not null,
    "dailyWages" numeric default 0,
    "monthlySalary" numeric default 0,
    active boolean default true,
    "joiningDate" text not null,
    "photoUrl" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 12. ATTENDANCE TABLE
create table if not exists attendance (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    date text not null,
    status text not null,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 13. ADVANCES TABLE
create table if not exists advances (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    amount numeric not null,
    date text not null,
    notes text,
    repaid boolean default false,
    "repayDate" text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 14. SALARIES TABLE
create table if not exists salaries (
    id text primary key,
    "workerId" text not null references workers(id) on delete cascade,
    month text not null,
    "calculatedSalary" numeric default 0,
    presents integer default 0,
    "halfDays" integer default 0,
    absents integer default 0,
    "paidLeavesUsed" integer default 0,
    "advanceDeductions" numeric default 0,
    bonus numeric default 0,
    "netPaid" numeric default 0,
    "paymentDate" text not null,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- Enable RLS on all tables
alter table config enable row level security;
alter table users enable row level security;
alter table customers enable row level security;
alter table measurements enable row level security;
alter table orders enable row level security;
alter table trials enable row level security;
alter table alterations enable row level security;
alter table invoices enable row level security;
alter table appointments enable row level security;
alter table expenses enable row level security;
alter table workers enable row level security;
alter table attendance enable row level security;
alter table advances enable row level security;
alter table salaries enable row level security;

-- Create Open/Permissive Policies for Authenticated & Public Access (suited for staff dashboard + clients accessing client-portal)
-- In a real-world enterprise setting, you can adjust these to restrict staff or portal access further.

create policy "Allow all operations for everyone" on config for all using (true) with check (true);
create policy "Allow all operations for everyone" on users for all using (true) with check (true);
create policy "Allow all operations for everyone" on customers for all using (true) with check (true);
create policy "Allow all operations for everyone" on measurements for all using (true) with check (true);
create policy "Allow all operations for everyone" on orders for all using (true) with check (true);
create policy "Allow all operations for everyone" on trials for all using (true) with check (true);
create policy "Allow all operations for everyone" on alterations for all using (true) with check (true);
create policy "Allow all operations for everyone" on invoices for all using (true) with check (true);
create policy "Allow all operations for everyone" on appointments for all using (true) with check (true);
create policy "Allow all operations for everyone" on expenses for all using (true) with check (true);
create policy "Allow all operations for everyone" on workers for all using (true) with check (true);
create policy "Allow all operations for everyone" on attendance for all using (true) with check (true);
create policy "Allow all operations for everyone" on advances for all using (true) with check (true);
create policy "Allow all operations for everyone" on salaries for all using (true) with check (true);

-- =====================================================================
-- STORAGE BUCKETS SETUP
-- =====================================================================

-- 1. Create the 'images' storage bucket if not exists
-- Run this in SQL, or go to Storage -> New Bucket -> Create a public bucket named 'images'
insert into storage.buckets (id, name, public) 
values ('images', 'images', true)
on conflict (id) do nothing;

-- 2. Storage security policies for the 'images' bucket
create policy "Allow Public Read Access on images"
on storage.objects for select
using ( bucket_id = 'images' );

create policy "Allow Authorized Uploads on images"
on storage.objects for insert
with check ( bucket_id = 'images' );

create policy "Allow Authorized Updates on images"
on storage.objects for update
using ( bucket_id = 'images' );

create policy "Allow Authorized Deletions on images"
on storage.objects for delete
using ( bucket_id = 'images' );
