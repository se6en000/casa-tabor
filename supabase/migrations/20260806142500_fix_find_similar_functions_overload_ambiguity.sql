-- Fixes a production-breaking regression introduced by the previous
-- migration (20260806142000): adding a 4th parameter to
-- find_similar_places/find_similar_contacts via `create or replace function`
-- does not replace the old 3/4-arg signature in Postgres — it creates a
-- second overload. PostgREST then cannot decide between the 3-param and
-- 4-param overloads for the 2-named-arg calls used by execute-ai-action and
-- enrich-event ({p_name, p_phone}), and every call started failing with
-- PGRST203 "Could not choose the best candidate function".
--
-- Fix: explicitly drop the old-arity overloads before the corrected
-- 4-parameter versions are (re)created, so exactly one signature exists per
-- function name.
drop function if exists public.find_similar_places(text, text, uuid);
drop function if exists public.find_similar_contacts(text, text, text, uuid);

create or replace function public.find_similar_places(
  p_name text,
  p_phone text default null,
  p_exclude_id uuid default null,
  p_include_dismissed boolean default false
) returns table(id uuid, name text, address text, phone text, confirmed boolean, score numeric, reason text)
language sql
stable
as $$
  select
    sp.id, sp.name, sp.address, sp.phone, sp.confirmed,
    greatest(
      case when p_name is not null and p_name = any(sp.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(p_phone) is not null
             and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone)
           then 0.95 else 0 end,
      case when p_name is not null and (sp.name ilike p_name or p_name ilike sp.name) then 0.85 else 0 end,
      case when p_name is not null then similarity(sp.name, p_name) else 0 end
    )::numeric as score,
    case
      when p_name is not null and p_name = any(sp.aliases) then 'alias'
      when public.normalize_phone(p_phone) is not null
           and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone) then 'phone'
      when p_name is not null and (sp.name ilike p_name or p_name ilike sp.name) then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_places sp
  where (p_include_dismissed or sp.dismissed_at is null)
    and (p_exclude_id is null or sp.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sp.name ilike p_name or p_name ilike sp.name
        or similarity(sp.name, p_name) > 0.4
        or p_name = any(sp.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sp.phone))
    )
  order by score desc
  limit 8
$$;

create or replace function public.find_similar_contacts(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_exclude_id uuid default null,
  p_include_dismissed boolean default false
) returns table(id uuid, name text, phone text, email text, relationship text, confirmed boolean, score numeric, reason text)
language sql
stable
as $$
  select
    sc.id, sc.name, sc.phone, sc.email, sc.relationship, sc.confirmed,
    greatest(
      case when p_name is not null and p_name = any(sc.aliases) then 1.00 else 0 end,
      case when public.normalize_phone(p_phone) is not null
             and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone)
           then 0.95 else 0 end,
      case when p_email is not null and lower(trim(p_email)) = lower(trim(coalesce(sc.email, '')))
             and lower(trim(p_email)) <> '' then 0.95 else 0 end,
      case when p_name is not null and (sc.name ilike p_name or p_name ilike sc.name) then 0.85 else 0 end,
      case when p_name is not null then similarity(sc.name, p_name) else 0 end
    )::numeric as score,
    case
      when p_name is not null and p_name = any(sc.aliases) then 'alias'
      when public.normalize_phone(p_phone) is not null
           and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone) then 'phone'
      when p_email is not null and lower(trim(p_email)) = lower(trim(coalesce(sc.email, '')))
           and lower(trim(p_email)) <> '' then 'email'
      when p_name is not null and (sc.name ilike p_name or p_name ilike sc.name) then 'name_containment'
      else 'name_similarity'
    end as reason
  from public.saved_contacts sc
  where (p_include_dismissed or sc.dismissed_at is null)
    and (p_exclude_id is null or sc.id <> p_exclude_id)
    and (
      (p_name is not null and (
        sc.name ilike p_name or p_name ilike sc.name
        or similarity(sc.name, p_name) > 0.4
        or p_name = any(sc.aliases)
      ))
      or (public.normalize_phone(p_phone) is not null
          and public.normalize_phone(p_phone) = public.normalize_phone(sc.phone))
    )
  order by score desc
  limit 8
$$;
