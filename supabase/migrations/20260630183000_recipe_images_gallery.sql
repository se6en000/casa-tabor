create table if not exists public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists recipe_images_recipe_id_idx on public.recipe_images(recipe_id, sort_order);
create index if not exists recipe_images_primary_idx on public.recipe_images(recipe_id, is_primary);

