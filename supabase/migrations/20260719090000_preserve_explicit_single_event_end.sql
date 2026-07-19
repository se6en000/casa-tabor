-- Preserve an explicitly supplied duration for ordinary calendar events.
-- Recurrence materialization manages template and occurrence ranges separately.

create or replace function public.enforce_event_end_30m_from_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is null or new.record_kind in ('series_template', 'occurrence') then
    return new;
  end if;

  if new.end_time is null or new.end_time <= new.start_time then
    new.end_time := new.start_time + interval '30 minutes';
  end if;

  return new;
end;
$$;
