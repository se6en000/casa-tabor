-- ============================================================================
-- Fix find_similar_places: the "containment" branch never actually contained
--
-- Found 2026-09-22 while investigating a chat-created event ("Kelly Workout")
-- whose location "amped" never resolved to the household's real saved place
-- "Amped Fitness Signature", confirmed live:
--   select similarity('Amped Fitness Signature', 'amped');        -- 0.25
--   select 'Amped Fitness Signature' ilike 'amped';                -- false
--   select 'Amped Fitness Signature' ilike '%amped%';              -- true
--   select * from find_similar_places('amped', null);              -- []
--
-- `sp.name ilike p_name` has no wildcards, so despite its 'name_containment'
-- label it is just a case-insensitive equality check -- it can never catch a
-- short/partial spoken name against a longer canonical saved-place name. The
-- plain similarity() fallback then tanks on the length mismatch (0.25, under
-- its own 0.4 WHERE-clause threshold), so the row never even reaches scoring.
--
-- Fix: use real substring containment both directions (0.85, unchanged
-- score/threshold otherwise) and add word_similarity() -- which scores how
-- well the shorter string matches AT LEAST one word of the longer one,
-- instead of the whole-string ratio -- as an additional fallback so a
-- genuinely fuzzy partial name (not an exact substring) still has a chance.
-- ============================================================================

create or replace function public.find_similar_places(
  p_name text,
  p_phone text default null,
  p_exclude_id uuid default null,
  p_include_dismissed boolean default false
)
returns table(id uuid, name text, address text, phone text, confirmed boolean, score numeric, reason text)
language sql
stable
set search_path = public
as $$
  select
    sp.id, sp.name, sp.address, sp.phone, sp.confirmed,
    greatest(
      case when p_name is not null and p_name = any(sp.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(p_phone) is not null
             and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone)
           then 0.95 else 0 end,
      case when p_name is not null and (
             sp.name ilike '%' || p_name || '%' or p_name ilike '%' || sp.name || '%'
           ) then 0.85 else 0 end,
      case when p_name is not null then similarity(sp.name, p_name) else 0 end,
      case when p_name is not null then word_similarity(p_name, sp.name) else 0 end
    )::numeric as score,
    case
      when p_name is not null and p_name = any(sp.aliases) then 'alias'
      when public.normalize_phone(p_phone) is not null
           and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone) then 'phone'
      when p_name is not null and (
             sp.name ilike '%' || p_name || '%' or p_name ilike '%' || sp.name || '%'
           ) then 'name_containment'
      when p_name is not null and word_similarity(p_name, sp.name) >= similarity(sp.name, p_name) then 'name_word_similarity'
      else 'name_similarity'
    end as reason
  from public.saved_places sp
  where (p_include_dismissed or sp.dismissed_at is null)
    and (p_exclude_id is null or sp.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sp.name ilike '%' || p_name || '%'
        or p_name ilike '%' || sp.name || '%'
        or similarity(sp.name, p_name) > 0.4
        or word_similarity(p_name, sp.name) > 0.4
        or p_name = any(sp.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone))
    )
  order by score desc
  limit 8
$$;

comment on function public.find_similar_places(text, text, uuid, boolean) is
  'Fuzzy-matches a spoken/typed place name or phone against saved_places. Containment now uses real substring matching (was a no-op equality check disguised as containment); word_similarity() added as a fallback for partial names that trigram similarity on the full strings scores too low.';
