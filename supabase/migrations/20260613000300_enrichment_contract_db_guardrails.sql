-- Enforce Event Details panel enrichment contract at schema level.
-- These legacy columns are intentionally removed so no write path can drift.
alter table public.event_enrichments
  drop column if exists distance_miles,
  drop column if exists weather_icon,
  drop column if exists special_instructions;

-- Keep confidence bounded to the canonical UI contract values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_enrichments_confidence_contract_check'
      and conrelid = 'public.event_enrichments'::regclass
  ) then
    alter table public.event_enrichments
      add constraint event_enrichments_confidence_contract_check
      check (confidence is null or confidence in ('low', 'medium', 'high'));
  end if;
end
$$;
