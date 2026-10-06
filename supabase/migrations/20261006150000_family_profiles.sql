-- Settings › Family profiles (Jake, Oct 6: "change the name, nicknames, add a pet, change the profile avatar color, and
-- additional preferences that could be useful to customize the wall and how it presents the family").
-- A pet is its own role (Milo was a hidden "child"); nicknames are other names the assistant knows a person by; a
-- chosen colour (one of the wall's six) overrides the colour that follows the family's order.
alter type public.family_role add value if not exists 'pet';
alter table public.family_members add column if not exists nicknames text[] not null default '{}';
alter table public.family_members add column if not exists pigment smallint check (pigment is null or (pigment >= 0 and pigment <= 5));

-- Two people's colours swapped, or two places in the order swapped, in one go (Settings › Family).
create or replace function public.arrange_family_members(p_changes jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c jsonb;
begin
  for c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    update public.family_members set
      pigment = case when c ? 'pigment' then nullif(c->>'pigment', '')::smallint else pigment end,
      sort_order = case when c ? 'sort_order' then (c->>'sort_order')::integer else sort_order end,
      updated_at = now()
    where id = (c->>'id')::uuid;
  end loop;
end;
$$;
grant execute on function public.arrange_family_members(jsonb) to anon, authenticated;
