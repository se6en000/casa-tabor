create or replace function public.trigger_enrich_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' or new.event_type = 'reminder' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/enrich-event',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('event_id', new.id)
  );
  return new;
exception when others then
  raise warning 'event enrichment dispatch failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;
