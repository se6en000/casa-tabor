-- Improve herb classification and aisle mapping (fresh herbs + dried herbs)

with default_store as (
  select id from public.grocery_store_profiles where is_default = true limit 1
)
insert into public.grocery_aisle_mappings (store_profile_id, category, subcategory, aisle_label, aisle_order)
select ds.id, v.category, v.subcategory, v.aisle_label, v.aisle_order
from default_store ds
cross join (
  values
    ('produce', 'herbs', 'Produce', 14),
    ('pantry', 'dried herbs', 'Pantry', 64)
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
  ('Fresh Basil', 'produce', 'herbs', 'Produce', array['basil', 'fresh basil leaves'], array[]::text[]),
  ('Cilantro', 'produce', 'herbs', 'Produce', array['fresh cilantro', 'coriander leaves'], array[]::text[]),
  ('Parsley', 'produce', 'herbs', 'Produce', array['fresh parsley'], array[]::text[]),
  ('Dill', 'produce', 'herbs', 'Produce', array['fresh dill'], array[]::text[]),
  ('Chives', 'produce', 'herbs', 'Produce', array['fresh chives'], array[]::text[]),
  ('Mint', 'produce', 'herbs', 'Produce', array['fresh mint'], array[]::text[]),
  ('Dried Oregano', 'pantry', 'dried herbs', 'Pantry', array['oregano'], array['McCormick', 'Simply Organic']),
  ('Dried Thyme', 'pantry', 'dried herbs', 'Pantry', array['thyme'], array['McCormick', 'Simply Organic']),
  ('Dried Rosemary', 'pantry', 'dried herbs', 'Pantry', array['rosemary'], array['McCormick', 'Simply Organic']),
  ('Italian Seasoning', 'pantry', 'dried herbs', 'Pantry', array['italian herb seasoning'], array['McCormick', 'Simply Organic'])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
