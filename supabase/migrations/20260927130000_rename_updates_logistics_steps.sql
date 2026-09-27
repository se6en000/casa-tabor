-- A renamed event's step-by-step plan says the new name (Jake, 2026-09-27: renamed "Defy or
-- Skyzone" to "SkyZone"; the steps — and the Google description built from them — still said
-- "Arrive at Defy or Skyzone by 9:00 AM"). The steps copy the title word for word when the plan
-- is written, so a rename swaps it in them, in the same save: whichever way the rename came (the
-- assistant, the wall, the phone, the classic app, or Google), and before the push to Google.
create or replace function public.rename_event_logistics_steps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a real rename, and only a title long enough not to match inside ordinary words.
  if new.title is distinct from old.title and length(coalesce(old.title, '')) >= 3 and coalesce(new.title, '') <> '' then
    update public.event_logistics
      set title = replace(title, old.title, new.title),
          description = replace(description, old.title, new.title)
      where event_id = new.id
        and (position(old.title in coalesce(title, '')) > 0 or position(old.title in coalesce(description, '')) > 0);
  end if;
  return null;
end;
$$;

drop trigger if exists rename_event_logistics_steps on public.events;
create trigger rename_event_logistics_steps
  after update of title on public.events
  for each row
  execute function public.rename_event_logistics_steps();
