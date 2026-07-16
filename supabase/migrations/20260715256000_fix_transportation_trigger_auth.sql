create or replace function public.trigger_event_transportation_plan_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
  target_event_id uuid;
begin
  target_event_id := case
    when tg_table_name = 'events' then new.id
    when tg_op = 'DELETE' then old.event_id
    else new.event_id
  end;
  if target_event_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_table_name = 'events' and tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.all_day is not distinct from old.all_day
     and new.event_type is not distinct from old.event_type
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at
     and new.location_name is not distinct from old.location_name
     and new.address is not distinct from old.address then
    return new;
  end if;

  if tg_table_name = 'event_enrichments' and tg_op = 'UPDATE'
     and new.category is not distinct from old.category then
    return new;
  end if;

  select decrypted_secret
  into trigger_secret
  from vault.decrypted_secrets
  where name = 'transportation_trigger_secret'
  limit 1;

  if trigger_secret is null then
    raise warning 'transportation plan generation skipped for event %: missing trigger secret', target_event_id;
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/ensure-event-transportation-plan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Casa-Transportation-Trigger', trigger_secret
    ),
    body := jsonb_build_object('event_id', target_event_id)
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
exception when others then
  raise warning 'transportation plan generation dispatch failed for event %: %', target_event_id, sqlerrm;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
