create table if not exists public.recipe_meal_plans (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  slot text not null check (slot in ('tonight', 'tomorrow', 'this-week')),
  planned_for date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, slot)
);

create index if not exists recipe_meal_plans_slot_idx on public.recipe_meal_plans(slot, planned_for);

create or replace function public.bump_recipe_meal_plan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists recipe_meal_plans_updated_at_trigger on public.recipe_meal_plans;
create trigger recipe_meal_plans_updated_at_trigger
before update on public.recipe_meal_plans
for each row execute function public.bump_recipe_meal_plan_updated_at();
