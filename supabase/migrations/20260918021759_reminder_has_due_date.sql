-- Events always have a real date/time; reminders can be genuinely date-less
-- ("just get this done" priorities vs. time-anchored tasks) -- per direct
-- user feedback, 2026-09-17. start_time/end_time stay NOT NULL (unchanged --
-- too many other app paths assume a real timestamp there), so this flag is
-- what every reminder-bucketing consumer must check first rather than trying
-- to infer "no date" from the stored placeholder value.
--
-- default true is deliberate: every existing row (all real calendar events,
-- and every reminder created before this migration) keeps its current,
-- correct "has a real date" behavior with zero backfill needed.
alter table public.events
  add column if not exists has_due_date boolean not null default true;
