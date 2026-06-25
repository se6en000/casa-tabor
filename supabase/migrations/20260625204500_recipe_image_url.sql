alter table if exists public.recipes
  add column if not exists image_url text;

create index if not exists recipes_image_url_idx on public.recipes(image_url);
