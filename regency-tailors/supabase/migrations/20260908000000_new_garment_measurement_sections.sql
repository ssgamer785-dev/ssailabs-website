-- =========================================================================
-- Regency Tailor — waistcoat, jacket and sherwani measurement sections
--
-- The showroom now measures three garments the schema did not know about:
--
--   Waistcoat  length, chest, stomach, hip, shoulder
--   Jacket     length, chest, stomach, hip, shoulder, collar
--   Sherwani   length, chest, stomach, hip, shoulder, sleeve, x-back, collar
--
-- and sells two composite garments — a 2 Piece Suit (coat + pant) and a
-- 3 Piece Suit (coat + pant + waistcoat). The composites store nothing of
-- their own: they are their components' canonical sections, so a suit's coat
-- is measured exactly like a coat and stays that way.
--
-- measurement_values.garment_category is a closed list, and an insert of
-- 'waistcoat' against the old list fails outright. This widens the list.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   It reads no rows, writes no rows and drops nothing. Widening a CHECK is
--   accepted by every row that already satisfies the narrower one, so every
--   existing coat, pant, shirt, kurta and pajama measurement is untouched and
--   still valid. There is no data migration to get wrong.
--
-- 'jacket_garment', not 'jacket': the application's legacy pre-Supabase shape
-- already uses `jacket` as the coat's fallback key, and a modern jacket stored
-- under that name would be read as an old order's coat.
-- =========================================================================

alter table public.measurement_values
    drop constraint if exists measurement_values_category_valid;

alter table public.measurement_values
    add constraint measurement_values_category_valid check (
        garment_category in (
            'coat', 'pant', 'shirt', 'kurta', 'pajama',
            'waistcoat', 'jacket_garment', 'sherwani'
        ));

comment on constraint measurement_values_category_valid on public.measurement_values is
    'The measurement sections the showroom records. Widened 2026-09-08 for the '
    'waistcoat, jacket and sherwani; composites (2/3 Piece Suit) reuse these.';
