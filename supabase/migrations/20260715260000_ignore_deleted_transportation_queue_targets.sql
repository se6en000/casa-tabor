create or replace function public.enqueue_event_transportation_plan_generation(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_secret text;
begin
  if target_event_id is null then return; end if;
  if not exists (select 1 from public.events where id = target_event_id) then return; end if;

  insert into public.event_transportation_generation_queue(event_id, requested_at, last_error)
  values (target_event_id, now(), null)
  on conflict (event_id) do update set
    requested_at = excluded.requested_at,
    last_error = null;

  begin
    select decrypted_secret
    into trigger_secret
    from vault.decrypted_secrets
    where name = 'transportation_trigger_secret'
    limit 1;

    if trigger_secret is not null then
      perform net.http_post(
        url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/ensure-event-transportation-plan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Casa-Transportation-Trigger', trigger_secret
        ),
        body := jsonb_build_object('event_id', target_event_id)
      );
    end if;
  exception when others then
    raise warning 'transportation plan generation dispatch failed for event %: %', target_event_id, sqlerrm;
  end;
end;
$$;
