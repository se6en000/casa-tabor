-- Recipes V2 (canvas row 49; Jake, Oct 6: "the ability to look up meals/recipes easily, keep track of the ones I cook
-- often (mark as favorites), ability to have a cooking experience on both the wall and more importantly my
-- phone/tablet"). Favorites, how often each is cooked, your place while cooking (shared by every device), and one
-- atomic save for a recipe with its ingredients, steps and photos.

alter table public.recipes add column if not exists favorite boolean not null default false;
alter table public.recipes add column if not exists cooked_count integer not null default 0;

-- One row per recipe being cooked: start on the phone, glance at the wall.
create table if not exists public.recipe_cooking (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  step integer not null default 0,
  servings_index integer not null default 0,
  ticked integer[] not null default '{}',
  timers jsonb not null default '[]'::jsonb,
  device text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recipe_cooking enable row level security;
drop policy if exists "family full access" on public.recipe_cooking;
create policy "family full access" on public.recipe_cooking for all using (true) with check (true);

-- Done cooking: one more time made, made today, and the place is let go.
create or replace function public.finish_cooking(p_recipe_id uuid)
returns void
language sql
set search_path to 'public'
as $$
  update public.recipes set cooked_count = cooked_count + 1, last_used_at = now(), updated_at = now() where id = p_recipe_id;
  delete from public.recipe_cooking where recipe_id = p_recipe_id;
$$;

-- A recipe with its ingredients, steps and photos in one transaction (new when p->>'id' is null). Ingredients, steps
-- and photos are replaced when given; a key left out keeps what's there.
create or replace function public.save_recipe(p jsonb)
returns uuid
language plpgsql
set search_path to 'public'
as $$
declare
  rid uuid := nullif(p->>'id', '')::uuid;
  steps_text text;
begin
  if coalesce(btrim(p->>'name'), '') = '' then
    raise exception 'A recipe needs a name.';
  end if;
  select string_agg(n::text || '. ' || s, E'\n' order by n)
    into steps_text
    from (select btrim(s) s, row_number() over (order by ord) n
            from jsonb_array_elements_text(coalesce(p->'steps', '[]'::jsonb)) with ordinality as t(s, ord)
           where btrim(s) <> '') kept;
  if rid is null then
    insert into public.recipes (name, source_type, source_url, servings, cook_time, image_url, instructions_text, last_used_at)
    values (btrim(p->>'name'), coalesce(nullif(p->>'source_type', ''), 'manual'), nullif(p->>'source_url', ''),
            nullif(btrim(coalesce(p->>'servings', '')), ''), nullif(btrim(coalesce(p->>'cook_time', '')), ''),
            nullif(p->>'image_url', ''), steps_text, now())
    returning id into rid;
  else
    update public.recipes set
      name = btrim(p->>'name'),
      servings = case when p ? 'servings' then nullif(btrim(coalesce(p->>'servings', '')), '') else servings end,
      cook_time = case when p ? 'cook_time' then nullif(btrim(coalesce(p->>'cook_time', '')), '') else cook_time end,
      image_url = case when p ? 'image_url' then nullif(p->>'image_url', '') else image_url end,
      instructions_text = case when p ? 'steps' then steps_text else instructions_text end,
      updated_at = now()
    where id = rid;
    if not found then raise exception 'That recipe is gone.'; end if;
  end if;

  if p ? 'ingredients' then
    delete from public.recipe_ingredients where recipe_id = rid;
    insert into public.recipe_ingredients (recipe_id, raw_text, name, quantity, unit, optional, sort_order)
    select rid, btrim(i->>'raw_text'), nullif(i->>'name', ''), nullif(i->>'quantity', ''), nullif(i->>'unit', ''),
           coalesce((i->>'optional')::boolean, false), (ord - 1)::int
      from jsonb_array_elements(p->'ingredients') with ordinality as t(i, ord)
      where btrim(coalesce(i->>'raw_text', '')) <> '';
  end if;

  if p ? 'steps' then
    delete from public.recipe_steps where recipe_id = rid;
    insert into public.recipe_steps (recipe_id, step_number, instruction)
    select rid, row_number() over (order by ord)::int, btrim(s)
      from jsonb_array_elements_text(p->'steps') with ordinality as t(s, ord)
      where btrim(s) <> '';
  end if;

  if p ? 'image_urls' then
    delete from public.recipe_images where recipe_id = rid;
    insert into public.recipe_images (recipe_id, image_url, is_primary, sort_order)
    select rid, u, u = p->>'image_url', (ord - 1)::int
      from jsonb_array_elements_text(p->'image_urls') with ordinality as t(u, ord)
      where btrim(u) <> '';
  end if;
  return rid;
end;
$$;
