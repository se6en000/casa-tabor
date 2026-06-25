-- Expand common grocery catalog coverage for high-volume products.

insert into public.grocery_catalog_items (
  canonical_name,
  category,
  subcategory,
  default_store_section,
  aliases,
  brand_keywords
)
values
  ('Limes', 'produce', 'citrus', 'Produce', array['lime', 'key limes'], array[]::text[]),
  ('Pears', 'produce', 'fruit', 'Produce', array['d anjou pears', 'bartlett pear', 'bosc pear'], array[]::text[]),
  ('Asparagus', 'produce', 'vegetables', 'Produce', array['fresh asparagus', 'organic asparagus'], array[]::text[]),
  ('Brussels Sprouts', 'produce', 'vegetables', 'Produce', array['brussel sprouts', 'brussels sprout'], array[]::text[]),
  ('Romaine Hearts', 'produce', 'greens', 'Produce', array['romaine', 'organic romaine'], array[]::text[]),
  ('Ginger Root', 'produce', 'vegetables', 'Produce', array['fresh ginger', 'ginger'], array[]::text[]),
  ('Clementines', 'produce', 'citrus', 'Produce', array['clementine', 'cuties clementines'], array[]::text[]),
  ('Artichokes', 'produce', 'vegetables', 'Produce', array['artichoke'], array[]::text[]),
  ('Half & Half', 'dairy', 'creamers', 'Dairy', array['half and half', 'half half'], array[]::text[]),
  ('Unsweetened Almond Milk', 'dairy', 'milk alternatives', 'Dairy', array['unsweetened almondmilk', 'almond milk', 'almondmilk'], array['Almond Breeze', 'Silk']),
  ('Tofu', 'pantry', 'plant protein', 'Pantry', array['firm tofu', 'extra firm tofu', 'organic tofu'], array['Nasoya', 'House Foods']),
  ('Genoa Salami', 'deli', 'prepared', 'Deli & Prepared', array['uncured genoa salami', 'salami'], array[]::text[]),
  ('Cooked Ham', 'deli', 'prepared', 'Deli & Prepared', array['uncured ham', 'slow cooked ham'], array[]::text[])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
