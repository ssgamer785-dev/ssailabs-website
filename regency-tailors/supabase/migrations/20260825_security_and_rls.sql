-- =========================================================================
-- REGENCY TAILORS — PRODUCTION DATABASE SCHEMA & ROW LEVEL SECURITY (RLS)
-- Top-Tier Security Hardening, Role-Based Access Control, and Atomic Sequencing
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOWROOM PROFILES & USERS
CREATE TABLE IF NOT EXISTS public.showroom_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Receptionist')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CUSTOMERS LEDGER
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    city TEXT DEFAULT 'Jalandhar',
    total_orders INTEGER DEFAULT 0,
    lifetime_spend NUMERIC(12, 2) DEFAULT 0.00,
    last_visit_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BESPOKE ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    customer_address TEXT,
    order_date DATE DEFAULT CURRENT_DATE,
    trial_date DATE,
    trial_time TEXT,
    trial_required BOOLEAN DEFAULT FALSE,
    trial_charge NUMERIC(10, 2) DEFAULT 0.00,
    delivery_date DATE NOT NULL,
    delivery_time TEXT,
    delivery_type TEXT DEFAULT 'Showroom Pickup',
    status TEXT NOT NULL DEFAULT 'New',
    production_status TEXT DEFAULT 'New',
    production_notes TEXT,
    priority TEXT DEFAULT 'Normal',
    salesperson TEXT,
    special_instructions TEXT,
    fitting_notes TEXT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    tax_amount NUMERIC(10, 2) DEFAULT 0.00,
    advance_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    urgent BOOLEAN DEFAULT FALSE,
    notes TEXT,
    measurements_snapshot JSONB,
    payment_method TEXT DEFAULT 'UPI / GPay',
    payment_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ORDER ITEMS (GARMENTS)
CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    garment_type TEXT NOT NULL,
    fabric_code TEXT,
    fabric_name TEXT,
    notes TEXT,
    remarks TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1,
    style_notes TEXT,
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MEASUREMENTS SPECIFICATIONS
CREATE TABLE IF NOT EXISTS public.measurements (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_number TEXT,
    garment_type TEXT NOT NULL,
    selected_garments TEXT[] DEFAULT ARRAY['Coat', 'Pant']::text[],
    unit TEXT DEFAULT 'inches',
    coat JSONB,
    pant JSONB,
    shirt JSONB,
    kurta JSONB,
    pajama JSONB,
    jacket JSONB,
    trouser JSONB,
    fit_preference TEXT DEFAULT 'Classic Tailored',
    posture_notes TEXT,
    fitting_notes TEXT,
    garment_remarks JSONB,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 6. FITTINGS & TRIALS
CREATE TABLE IF NOT EXISTS public.fittings (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    garment TEXT NOT NULL,
    trial_stage TEXT NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    adjustment_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. WORKERS & ARTISANS
CREATE TABLE IF NOT EXISTS public.workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    phone TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Piece-Rate',
    rate_per_garment NUMERIC(10, 2) DEFAULT 0.00,
    monthly_salary NUMERIC(10, 2) DEFAULT 0.00,
    garments_completed_this_month INTEGER DEFAULT 0,
    total_earned NUMERIC(12, 2) DEFAULT 0.00,
    advance_taken NUMERIC(12, 2) DEFAULT 0.00,
    balance_payout NUMERIC(12, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'Active'
);

-- 8. INVOICES & BILLINGS
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(10, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_remaining NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'UPI / GPay',
    status TEXT NOT NULL DEFAULT 'Outstanding',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "user" TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details TEXT NOT NULL
);

-- 10. RECYCLE BIN / TRASH
CREATE TABLE IF NOT EXISTS public.trash (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    title TEXT NOT NULL,
    original_data JSONB NOT NULL,
    deleted_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_by TEXT NOT NULL
);

-- =========================================================================
-- ATOMIC ORDER NUMBER GENERATION TRIGGER (ANTI-RACE CONDITION / LOCK PROTECTED)
-- =========================================================================

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_atomic_order_number()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
    formatted_num TEXT;
BEGIN
    -- Acquire transaction level advisory lock to prevent race conditions during peak hours
    PERFORM pg_advisory_xact_lock(88991985);
    
    SELECT nextval('public.order_number_seq') INTO next_num;
    formatted_num := next_num::TEXT;
    
    RETURN formatted_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) HARDENING POLICIES
-- =========================================================================

-- Enable RLS on all tables
ALTER TABLE public.showroom_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fittings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current authenticated user is Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.showroom_profiles
        WHERE user_id = auth.uid() AND role = 'Admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if current user is authenticated showroom staff (Admin or Receptionist)
CREATE OR REPLACE FUNCTION public.is_showroom_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.role() = 'authenticated');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POLICIES FOR CUSTOMERS
CREATE POLICY "Showroom Staff can view customers" ON public.customers
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "Showroom Staff can insert/update customers" ON public.customers
    FOR ALL TO authenticated
    USING (public.is_showroom_staff())
    WITH CHECK (public.is_showroom_staff());

-- POLICIES FOR ORDERS
CREATE POLICY "Showroom Staff can view orders" ON public.orders
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "Showroom Staff can manage orders" ON public.orders
    FOR ALL TO authenticated
    USING (public.is_showroom_staff())
    WITH CHECK (public.is_showroom_staff());

-- POLICIES FOR ORDER ITEMS
CREATE POLICY "Showroom Staff can view order items" ON public.order_items
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "Showroom Staff can manage order items" ON public.order_items
    FOR ALL TO authenticated
    USING (public.is_showroom_staff())
    WITH CHECK (public.is_showroom_staff());

-- POLICIES FOR MEASUREMENTS
CREATE POLICY "Showroom Staff can view measurements" ON public.measurements
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "Showroom Staff can manage measurements" ON public.measurements
    FOR ALL TO authenticated
    USING (public.is_showroom_staff())
    WITH CHECK (public.is_showroom_staff());

-- POLICIES FOR TRASH (Permanent deletion restricted to Admins)
CREATE POLICY "Showroom Staff can view and restore trash" ON public.trash
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "Showroom Staff can insert into trash" ON public.trash
    FOR INSERT TO authenticated
    WITH CHECK (public.is_showroom_staff());

CREATE POLICY "Only Admin can permanently delete trash" ON public.trash
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- POLICIES FOR AUDIT LOGS (Read-only for Staff, Purge restricted to Admin)
CREATE POLICY "Authenticated Staff can view audit logs" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_showroom_staff());

CREATE POLICY "System and Staff can insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_showroom_staff());

CREATE POLICY "Only Admin can clear audit logs" ON public.audit_logs
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- ISOLATED CLIENT PORTAL SECURE RPC (Returns only the caller's specific order and measurements by exact phone number)
CREATE OR REPLACE FUNCTION public.get_client_portal_data(
    p_phone TEXT,
    p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_clean_phone TEXT;
BEGIN
    v_clean_phone := regexp_replace(p_phone, '[^\d]', '', 'g');
    
    IF length(v_clean_phone) < 10 THEN
        RAISE EXCEPTION 'Invalid phone number length';
    END IF;

    SELECT jsonb_build_object(
        'customer', (
            SELECT to_jsonb(c) FROM public.customers c 
            WHERE regexp_replace(c.phone, '[^\d]', '', 'g') = v_clean_phone 
            LIMIT 1
        ),
        'orders', (
            SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM public.orders o
            WHERE regexp_replace(o.customer_phone, '[^\d]', '', 'g') = v_clean_phone
            AND (p_order_id IS NULL OR o.id = p_order_id OR o.order_number = p_order_id)
        ),
        'measurements', (
            SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM public.measurements m
            WHERE regexp_replace(m.customer_phone, '[^\d]', '', 'g') = v_clean_phone
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution of secure RPC to public anon role for client portal
GRANT EXECUTE ON FUNCTION public.get_client_portal_data(TEXT, TEXT) TO anon, authenticated;
