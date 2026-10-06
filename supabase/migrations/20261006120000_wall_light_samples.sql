-- Settings › The wall (canvas 47c/47f; Jake, Oct 6: "where it is on the color spectrum currently, brightness graph").
-- The Pi's sensor bridge measures the room's light (colour temperature, lux) and sets the screen to match (brightness,
-- RGB tint). Every five minutes it records what it measured and set; Settings draws "right now" and "today" from it.
-- Three days are kept. The bridge writes with the app's public key, so the function checks what it's given.
create table if not exists public.wall_light_samples (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  cct integer,
  lux numeric,
  brightness integer,
  rgb integer[],
  display_on boolean,
  zone text
);
create index if not exists wall_light_samples_at_idx on public.wall_light_samples (at desc);
alter table public.wall_light_samples enable row level security;

create or replace function public.log_wall_light(p_cct integer, p_lux numeric, p_brightness integer, p_rgb integer[], p_display_on boolean, p_zone text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if (p_cct is not null and (p_cct < 1000 or p_cct > 20000)) or (p_lux is not null and (p_lux < 0 or p_lux > 200000))
     or (p_brightness is not null and (p_brightness < 0 or p_brightness > 100)) or coalesce(array_length(p_rgb, 1), 3) <> 3 then
    raise exception 'reading out of range';
  end if;
  -- At most one sample a minute, whatever calls it.
  if exists (select 1 from public.wall_light_samples where at > now() - interval '1 minute') then return; end if;
  insert into public.wall_light_samples (cct, lux, brightness, rgb, display_on, zone)
    values (p_cct, round(p_lux, 1), p_brightness, p_rgb, p_display_on, left(p_zone, 24));
  delete from public.wall_light_samples where at < now() - interval '3 days';
end;
$$;

create or replace function public.get_wall_light(p_hours integer default 24)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'cct', cct, 'lux', lux, 'brightness', brightness, 'rgb', rgb, 'display_on', display_on) order by at), '[]'::jsonb)
  from public.wall_light_samples where at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 72))
$$;

grant execute on function public.log_wall_light(integer, numeric, integer, integer[], boolean, text) to anon, authenticated;
grant execute on function public.get_wall_light(integer) to anon, authenticated;
