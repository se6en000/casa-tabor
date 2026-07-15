create or replace function public.normalize_null_transportation_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.transportation_plan = 'null'::jsonb then
    new.transportation_plan := null;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_null_transportation_plan on public.event_plan_overrides;
create trigger normalize_null_transportation_plan
  before insert or update of transportation_plan on public.event_plan_overrides
  for each row execute function public.normalize_null_transportation_plan();

comment on function public.normalize_null_transportation_plan() is
  'Normalizes JSON null to SQL NULL before transportation plan validation.';
