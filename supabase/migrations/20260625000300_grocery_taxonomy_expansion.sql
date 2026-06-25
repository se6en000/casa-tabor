-- Phase 1 + 3: richer grocery taxonomy and catalog seed expansion

with default_store as (
  select id from public.grocery_store_profiles where is_default = true limit 1
)
insert into public.grocery_aisle_mappings (store_profile_id, category, subcategory, aisle_label, aisle_order)
select ds.id, v.category, v.subcategory, v.aisle_label, v.aisle_order
from default_store ds
cross join (
  values
    ('snacks', null, 'Snacks', 80),
    ('deli', null, 'Deli & Prepared', 90),
    ('household', null, 'Household', 100),
    ('personal-care', null, 'Personal Care', 110),
    ('baby', null, 'Baby', 120),
    ('pet', null, 'Pet', 130),
    ('pantry', 'canned fruit', 'Pantry', 62),
    ('pantry', 'spreads', 'Pantry', 63),
    ('snacks', 'chips', 'Snacks', 81),
    ('snacks', 'bars', 'Snacks', 82),
    ('snacks', 'crackers', 'Snacks', 83)
) as v(category, subcategory, aisle_label, aisle_order)
where not exists (
  select 1
  from public.grocery_aisle_mappings existing
  where existing.store_profile_id = ds.id
    and existing.category = v.category
    and coalesce(existing.subcategory, '') = coalesce(v.subcategory, '')
);

insert into public.grocery_catalog_items (
  canonical_name,
  category,
  subcategory,
  default_store_section,
  aliases,
  brand_keywords
)
values
  ('Applesauce', 'pantry', 'canned fruit', 'Pantry', array['apple sauce', 'applesauce pouches', 'organic applesauce'], array['Mott''s', 'GoGo squeeZ']),
  ('Potato Chips', 'snacks', 'chips', 'Snacks', array['chips', 'kettle chips', 'potato chip'], array['Lay''s', 'Kettle']),
  ('Tortilla Chips', 'snacks', 'chips', 'Snacks', array['corn chips', 'nacho chips'], array['Tostitos', 'Santitas']),
  ('Granola Bars', 'snacks', 'bars', 'Snacks', array['protein bars', 'snack bars'], array['Kind', 'Nature Valley', 'Clif']),
  ('Crackers', 'snacks', 'crackers', 'Snacks', array['ritz crackers', 'saltines', 'wheat crackers'], array['Ritz', 'Triscuit']),
  ('Rotisserie Chicken', 'deli', 'prepared', 'Deli & Prepared', array['prepared chicken'], array[]::text[]),
  ('Deli Turkey', 'deli', 'prepared', 'Deli & Prepared', array['lunch meat turkey', 'sliced turkey'], array['Boar''s Head']),
  ('Paper Towels', 'household', 'paper goods', 'Household', array['paper towel'], array['Bounty', 'Viva']),
  ('Toilet Paper', 'household', 'paper goods', 'Household', array['toilet tissue'], array['Charmin', 'Cottonelle']),
  ('Dish Soap', 'household', 'cleaning', 'Household', array['dish detergent'], array['Dawn']),
  ('Laundry Detergent', 'household', 'cleaning', 'Household', array['laundry soap'], array['Tide', 'Gain']),
  ('Toothpaste', 'personal-care', 'oral care', 'Personal Care', array['tooth paste'], array['Crest', 'Colgate']),
  ('Deodorant', 'personal-care', 'body care', 'Personal Care', array['deoderant'], array['Dove', 'Old Spice']),
  ('Shampoo', 'personal-care', 'body care', 'Personal Care', array[]::text[], array['Pantene', 'Head & Shoulders']),
  ('Baby Wipes', 'baby', 'baby care', 'Baby', array['wipes baby'], array['Pampers', 'Huggies']),
  ('Diapers', 'baby', 'baby care', 'Baby', array['baby diapers'], array['Pampers', 'Huggies']),
  ('Dog Food', 'pet', 'pet food', 'Pet', array['kibble dog'], array['Purina', 'Blue Buffalo']),
  ('Cat Food', 'pet', 'pet food', 'Pet', array['kibble cat'], array['Friskies', 'Fancy Feast']),
  ('Cat Litter', 'pet', 'pet care', 'Pet', array[]::text[], array['Tidy Cats'])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
