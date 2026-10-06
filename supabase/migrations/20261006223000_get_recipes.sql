-- Recipes V2: every recipe with its ingredient lines, steps and photos in one read (no client-side joins).
create or replace function public.get_recipes()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'cook_time', r.cook_time, 'servings', r.servings,
    'source_type', r.source_type, 'source_url', r.source_url, 'image_url', r.image_url,
    'last_used_at', r.last_used_at, 'favorite', r.favorite, 'cooked_count', r.cooked_count, 'created_at', r.created_at,
    'ingredients', coalesce((select jsonb_agg(i.raw_text order by i.sort_order) from public.recipe_ingredients i where i.recipe_id = r.id), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(s.instruction order by s.step_number) from public.recipe_steps s where s.recipe_id = r.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(m.image_url order by m.is_primary desc, m.sort_order) from public.recipe_images m where m.recipe_id = r.id), '[]'::jsonb)
  ) order by r.name), '[]'::jsonb)
  from public.recipes r
$$;
