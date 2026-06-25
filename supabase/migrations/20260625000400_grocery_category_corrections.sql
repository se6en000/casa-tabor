-- Phase 4: manual correction feedback loop for grocery categorization learning

create table if not exists public.grocery_category_corrections (
  id uuid primary key default gen_random_uuid(),
  grocery_item_id uuid references public.grocery_items(id) on delete set null,
  item_name text,
  from_category text not null,
  to_category text not null,
  source text not null default 'manual-ui',
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists grocery_category_corrections_created_idx
  on public.grocery_category_corrections (created_at desc);

create index if not exists grocery_category_corrections_item_name_idx
  on public.grocery_category_corrections (lower(coalesce(item_name, '')));

create index if not exists grocery_category_corrections_unapplied_idx
  on public.grocery_category_corrections (applied_at)
  where applied_at is null;
