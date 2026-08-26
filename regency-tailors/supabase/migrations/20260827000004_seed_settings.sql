-- =========================================================================
-- REGENCY TAILORS — SHOWROOM SETTINGS SEED
--
-- These are the details confirmed by the owner as the real showroom address,
-- and match what already prints on the customer bill. The conflicting
-- "382, Model Town Market / +91 181 245 8899" profile that shipped in
-- src/data/initialData.ts was invented and is removed in the same change.
--
-- gstin is deliberately left NULL. The GSTIN that shipped with the invented
-- profile (03AAAAA0000A1Z5) is a dummy-format placeholder, and a tax number
-- must never be guessed. Set the real one with:
--
--     update public.showroom_settings set gstin = '<real GSTIN>';
--
-- Nothing renders a GSTIN until it is set.
-- =========================================================================

insert into public.showroom_settings (id, name, subtitle, city, address_line1, address_line2, phone, email, gstin)
values (
    true,
    'REGENCY TAILORS',
    'Bespoke Showroom & Tailoring Suite',
    'JALANDHAR',
    'BOOTAN MANDI,',
    'JALANDHAR, PUNJAB 144001',
    '99887 71631',
    null,
    null
)
on conflict (id) do nothing;

-- =========================================================================
-- AUTHORISING THE ADMIN ACCOUNT
--
-- No account is authorised by this migration. An invented allowlist entry
-- would be a live account with full access to client data, so the owner runs
-- this once with their real Google address:
--
--     select public.authorize_admin('owner@gmail.com', 'Showroom Owner');
--
-- Until then, Google sign-in succeeds but returns no business data, which is
-- the intended behaviour for an unauthorised account.
-- =========================================================================
