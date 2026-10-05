-- A new to-do is Jake's unless someone else is said (Jake, Oct 5: "if it's not obvious who this is for, then default it
-- to Jake and I will delegate from there"): the household's first parent goes on it as primary. Never as a driver.
create or replace function public.todo_add(p_title text, p_due date default null::date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_title text := nullif(btrim(p_title), '');
  v_start timestamptz;
  v_id uuid;
  v_owner uuid;
begin
  if v_title is null then raise exception 'A to-do needs a title'; end if;
  v_start := case
    when p_due is not null then (p_due::timestamp + interval '17 hours') at time zone 'America/New_York'
    else date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'
  end;
  insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
  values (v_title, v_start, v_start + interval '15 minutes', 'reminder', p_due is not null, false)
  returning id into v_id;
  select id into v_owner from public.family_members where role = 'parent' order by sort_order nulls last, created_at limit 1;
  if v_owner is not null then
    insert into public.event_members (event_id, family_member_id, role) values (v_id, v_owner, 'primary');
  end if;
  return v_id;
end;
$function$;
