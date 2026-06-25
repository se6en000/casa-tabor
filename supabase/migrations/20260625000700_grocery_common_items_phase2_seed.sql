-- Additional high-frequency grocery item seed expansion (phase 2 quality pass)

insert into public.grocery_catalog_items (
  canonical_name,
  category,
  subcategory,
  default_store_section,
  aliases,
  brand_keywords
)
values
  ('Asparagus', 'produce', 'vegetables', 'Produce', array['fresh asparagus', 'organic asparagus'], array[]::text[]),
  ('Hummus', 'deli', 'prepared', 'Deli & Prepared', array['original hummus', 'hommus', 'classic hummus'], array['Sabra', 'Hope']),
  ('Spaghetti', 'pantry', 'pasta', 'Pantry', array['organic spaghetti'], array['Barilla', 'De Cecco']),
  ('Fusilli', 'pantry', 'pasta', 'Pantry', array['whole wheat fusilli'], array['Barilla', 'De Cecco']),
  ('Penne', 'pantry', 'pasta', 'Pantry', array['penne rigate', 'organic penne'], array['Barilla', 'De Cecco']),
  ('Salsa', 'pantry', 'sauces', 'Pantry', array['mild salsa', 'medium salsa', 'chunky salsa'], array[]::text[]),
  ('Kombucha', 'beverages', 'functional drinks', 'Beverages', array['raw kombucha', 'organic kombucha'], array['Synergy']),
  ('Veggie Straws', 'snacks', 'chips', 'Snacks', array['veggie straws original'], array['Sensible Portions']),
  ('Wafers', 'snacks', 'crackers', 'Snacks', array['nilla wafers', 'wafer cookies'], array[]::text[]),
  ('Green Cabbage', 'produce', 'vegetables', 'Produce', array['organic green cabbage'], array[]::text[])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
