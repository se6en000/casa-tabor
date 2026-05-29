-- Auto-enrich new events using Supabase's built-in trigger→edge-function mechanism
-- Uses net.http_post (pg_net) which is pre-installed on all Supabase projects

create or replace function public.trigger_enrich_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/enrich-event',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1)
    ),
    body    := jsonb_build_object('event_id', NEW.id)
  );
  return NEW;
exception when others then
  -- Never block the event insert if enrichment call fails
  return NEW;
end;
$$;

drop trigger if exists auto_enrich_on_insert on public.events;
create trigger auto_enrich_on_insert
  after insert on public.events
  for each row
  execute function public.trigger_enrich_event();
