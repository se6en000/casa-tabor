-- "Add paint the house to my to-do list" (Jake's bug report 2026-09-28): a to-do from the assistant,
-- saved the way upsert_todo_reminder_from_ios saves one from his phone — a reminder event, undated
-- (today, has_due_date false) unless he gave a day (5 PM that day, New York time). The Casa → iOS
-- sync puts it on his "To Do" list, and Casa sorts it like anything he captured.
create or replace function public.todo_add(p_title text, p_due date default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text := nullif(btrim(p_title), '');
  v_start timestamptz;
  v_id uuid;
begin
  if v_title is null then raise exception 'A to-do needs a title'; end if;
  v_start := case
    when p_due is not null then (p_due::timestamp + interval '17 hours') at time zone 'America/New_York'
    else date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'
  end;
  insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
  values (v_title, v_start, v_start + interval '15 minutes', 'reminder', p_due is not null, false)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.todo_add(text, date) from public, anon, authenticated;
