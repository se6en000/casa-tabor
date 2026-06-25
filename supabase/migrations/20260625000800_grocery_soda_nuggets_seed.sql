-- Ensure common soda brands and nuggets classify reliably.

insert into public.grocery_catalog_items (
  canonical_name,
  category,
  subcategory,
  default_store_section,
  aliases,
  brand_keywords
)
values
  ('Coke', 'beverages', 'soft drinks', 'Beverages', array['coca cola', 'coke zero', 'diet coke'], array['Coca-Cola']),
  ('Sprite', 'beverages', 'soft drinks', 'Beverages', array['sprite soda'], array['Coca-Cola']),
  ('Pepsi', 'beverages', 'soft drinks', 'Beverages', array[]::text[], array['Pepsi']),
  ('Dino Nuggets', 'frozen', 'frozen meals', 'Frozen', array['dinosaur nuggets', 'chicken nuggets', 'dino nugget'], array['Tyson', 'Yummy'])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
