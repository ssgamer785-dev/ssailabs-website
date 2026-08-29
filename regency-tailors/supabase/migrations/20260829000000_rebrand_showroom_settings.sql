-- =========================================================================
-- REGENCY TAILOR — SHOWROOM REBRAND
--
-- Two owner-confirmed changes to the business identity:
--
--   1. The business name loses its trailing "S": REGENCY TAILORS → REGENCY TAILOR.
--   2. The showroom pincode changes: 144001 → 144003.
--
-- 20260827000004_seed_settings.sql inserts the showroom row with
-- `on conflict (id) do nothing`, so correcting the values there only helps a
-- database created from scratch. Any database already seeded keeps the old
-- name and pincode, because an applied migration never re-runs. This
-- migration exists to carry the change onto those live databases, keeping
-- public.showroom_settings the single source of truth the application reads.
--
-- Deliberately scoped to the showroom's own row (id = true, the singleton).
-- Customer addresses are never touched: a customer who genuinely lives in the
-- 144001 postal area must keep it.
-- =========================================================================

-- Each column is rewritten only where it still holds the old value, so an
-- owner who has already customised one of them (a different trading name, a
-- corrected address line) keeps their edit instead of having it overwritten
-- by the other column's rename. The where clause only avoids a pointless
-- write when neither column needs changing.
update public.showroom_settings
set
    name = case
        when name = 'REGENCY TAILORS' then 'REGENCY TAILOR'
        else name
    end,
    address_line2 = case
        when address_line2 = 'JALANDHAR, PUNJAB 144001' then 'JALANDHAR, PUNJAB 144003'
        else address_line2
    end,
    updated_at = now()
where id
  and (name = 'REGENCY TAILORS' or address_line2 = 'JALANDHAR, PUNJAB 144001');
