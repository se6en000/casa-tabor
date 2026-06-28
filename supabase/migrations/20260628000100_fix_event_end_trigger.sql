-- Fix regression from 20260620000100: do not overwrite explicit event end_time.
-- We only backfill a sane default when end_time is missing/invalid.

create or replace function public.enforce_event_end_30m_from_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is null then
    return new;
  end if;

  if new.end_time is null or new.end_time <= new.start_time then
    if coalesce(new.all_day, false) then
      new.end_time := date_trunc('day', new.start_time) + interval '23 hours 59 minutes 59 seconds';
    else
      new.end_time := new.start_time + interval '30 minutes';
    end if;
  end if;

  return new;
end;
$$;
