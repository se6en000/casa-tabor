create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('url', 'image', 'pdf', 'manual')),
  source_url text,
  source_excerpt text,
  instructions_text text,
  servings text,
  cook_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  raw_text text not null,
  name text,
  quantity text,
  unit text,
  optional boolean not null default false,
  sort_order integer not null default 0,
  category_hint text,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  step_number integer not null,
  instruction text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('url', 'image', 'pdf', 'manual')),
  source_url text,
  source_excerpt text,
  parsed_name text,
  parsed_payload jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create index if not exists recipes_created_at_idx on public.recipes(created_at desc);
create index if not exists recipes_last_used_at_idx on public.recipes(last_used_at desc nulls last);
create index if not exists recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id, sort_order);
create index if not exists recipe_steps_recipe_id_idx on public.recipe_steps(recipe_id, step_number);
create index if not exists recipe_import_runs_created_at_idx on public.recipe_import_runs(created_at desc);

create or replace function public.bump_recipe_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists recipes_updated_at_trigger on public.recipes;
create trigger recipes_updated_at_trigger
before update on public.recipes
for each row execute function public.bump_recipe_updated_at();
