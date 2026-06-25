create table if not exists public.grocery_catalog_items (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  canonical_name_normalized text generated always as (
    regexp_replace(lower(btrim(canonical_name)), '\s+', ' ', 'g')
  ) stored,
  category text not null,
  subcategory text,
  default_store_section text,
  aliases text[] not null default '{}',
  brand_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists grocery_catalog_items_canonical_norm_uidx
  on public.grocery_catalog_items (canonical_name_normalized);

create table if not exists public.grocery_store_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain text,
  city text,
  state text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists grocery_store_profiles_default_uidx
  on public.grocery_store_profiles (is_default)
  where is_default = true;

create table if not exists public.grocery_aisle_mappings (
  id uuid primary key default gen_random_uuid(),
  store_profile_id uuid references public.grocery_store_profiles(id) on delete cascade,
  category text not null,
  subcategory text,
  aisle_label text not null,
  aisle_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists grocery_aisle_mappings_store_cat_subcat_uidx
  on public.grocery_aisle_mappings (store_profile_id, category, coalesce(subcategory, ''));

alter table public.grocery_items
  add column if not exists canonical_item_id uuid references public.grocery_catalog_items(id) on delete set null,
  add column if not exists subcategory text,
  add column if not exists brand text,
  add column if not exists store_section text,
  add column if not exists enhancement_confidence numeric(5,4),
  add column if not exists enhanced_at timestamptz;

create index if not exists grocery_items_canonical_item_id_idx
  on public.grocery_items (canonical_item_id);

create index if not exists grocery_items_store_section_idx
  on public.grocery_items (store_section);

insert into public.grocery_store_profiles (name, chain, city, state, is_default)
values ('Default Home Store', null, null, null, true)
on conflict do nothing;

with default_store as (
  select id from public.grocery_store_profiles where is_default = true limit 1
)
insert into public.grocery_aisle_mappings (store_profile_id, category, subcategory, aisle_label, aisle_order)
select ds.id, v.category, v.subcategory, v.aisle_label, v.aisle_order
from default_store ds
cross join (
  values
    ('produce', null, 'Produce', 10),
    ('bakery', null, 'Bakery', 20),
    ('dairy', null, 'Dairy', 30),
    ('meat', null, 'Meat & Seafood', 40),
    ('frozen', null, 'Frozen', 50),
    ('pantry', null, 'Pantry', 60),
    ('beverages', null, 'Beverages', 70),
    ('other', null, 'Other', 90)
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
  ('Ribeye Steak', 'meat', 'beef', 'Meat & Seafood', array['rib eye', 'ribeye', 'rib-eye', 'a rib eye'], array[]::text[]),
  ('Eggs', 'dairy', 'eggs', 'Dairy', array['egg'], array[]::text[]),
  ('Milk', 'dairy', 'milk', 'Dairy', array['whole milk', '2 percent milk', 'two percent milk'], array[]::text[]),
  ('Bananas', 'produce', 'fruit', 'Produce', array['banana', 'bannanas', 'banannas', 'bannana'], array[]::text[]),
  ('Blueberries', 'produce', 'fruit', 'Produce', array['blue berries', 'blueberry', 'blueberies'], array[]::text[]),
  ('Strawberries', 'produce', 'fruit', 'Produce', array['straw berry', 'strawberries'], array[]::text[]),
  ('Kiwi', 'produce', 'fruit', 'Produce', array['kiwis'], array[]::text[]),
  ('Watermelon', 'produce', 'fruit', 'Produce', array['water melon'], array[]::text[]),
  ('Bread', 'bakery', 'bread', 'Bakery', array[]::text[], array[]::text[]),
  ('Riced Frozen Cauliflower', 'frozen', 'vegetables', 'Frozen', array['riced cauliflower frozen', 'frozen cauliflower rice', 'braced frozen cauliflower'], array[]::text[]),
  ('Coffee', 'beverages', 'coffee', 'Beverages', array['espresso coffee', 'coffee pods', 'nespresso pods'], array['nespresso']),
  ('Chicken', 'meat', 'poultry', 'Meat & Seafood', array['chicken breast'], array[]::text[]),
  ('Canned Tuna', 'pantry', 'canned goods', 'Pantry', array['organic tuna cans', 'tuna canned fresh natural'], array[]::text[]),
  ('Ramen Noodles', 'pantry', 'dry goods', 'Pantry', array['beef ramen'], array[]::text[])
on conflict (canonical_name_normalized) do update
set
  category = excluded.category,
  subcategory = excluded.subcategory,
  default_store_section = excluded.default_store_section,
  aliases = excluded.aliases,
  brand_keywords = excluded.brand_keywords,
  updated_at = now();
