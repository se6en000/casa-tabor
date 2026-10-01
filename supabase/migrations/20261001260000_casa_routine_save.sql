-- Routines on the Family Wall (canvas row 16): a person can have several (school, work, a class …), each kept as
-- member_availability_rules rows whose JSON reason carries the routine's key ("main" when an older row has none).
-- Saving one replaces only that routine's rows, in one transaction. Saving the Work routine read from plain
-- "Working hours" rows (key "work-hours") replaces those plain rows too.

create or replace function public.casa_routine_payload(p_reason text)
returns jsonb language plpgsql immutable as $$
begin
  if p_reason is null or p_reason !~ '^\s*\{' then return null; end if;
  begin
    return case when (p_reason::jsonb ->> 'type') in ('family_routine', 'school_routine') then p_reason::jsonb end;
  exception when others then
    return null;
  end;
end $$;

create or replace function public.casa_routine_save(p_member uuid, p_key text, p_rows jsonb)
returns jsonb language plpgsql as $$
declare
  removed int;
  added int;
begin
  if p_member is null or coalesce(p_key, '') = '' then
    raise exception 'casa_routine_save: a member and a routine key are needed';
  end if;
  delete from public.member_availability_rules r
  where r.member_id = p_member
    and (
      coalesce(public.casa_routine_payload(r.reason) ->> 'key', case when public.casa_routine_payload(r.reason) is not null then 'main' end) = p_key
      or (p_key = 'work-hours' and r.availability_type = 'unavailable' and public.casa_routine_payload(r.reason) is null)
    );
  get diagnostics removed = row_count;
  insert into public.member_availability_rules (member_id, day_of_week, start_local, end_local, availability_type, reason, timezone)
  select p_member, (x ->> 'day_of_week')::int, (x ->> 'start_local')::time, (x ->> 'end_local')::time,
         coalesce(x ->> 'availability_type', 'unavailable'), x ->> 'reason', coalesce(x ->> 'timezone', 'America/New_York')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x;
  get diagnostics added = row_count;
  return jsonb_build_object('removed', removed, 'added', added);
end $$;

grant execute on function public.casa_routine_payload(text) to anon, authenticated, service_role;
grant execute on function public.casa_routine_save(uuid, text, jsonb) to anon, authenticated, service_role;
