create or replace function public.enforce_event_end_30m_from_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.start_time is distinct from old.start_time then
    new.end_time := new.start_time + interval '30 minutes';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_event_end_30m_from_start on public.events;
create trigger trg_enforce_event_end_30m_from_start
  before insert or update on public.events
  for each row
  execute function public.enforce_event_end_30m_from_start();
