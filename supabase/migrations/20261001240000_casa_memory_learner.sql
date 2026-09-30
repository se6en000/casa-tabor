-- Casa's memory, phase 2 (the nightly learner) and the privacy switch (design doc c1bc97e8; Jake 2026-09-30:
-- "build this privacy feature in but I want it disabled by default for now, I want to see everything on the wall").
alter table public.casa_memory add column if not exists sensitive boolean not null default false;
-- Health and therapy facts already in memory are sensitive (said only on a phone once the switch is on).
update public.casa_memory set sensitive = true
where text ~* '(therapy|ABA|doctor|pediatric|dermatolog|medication|diagnos)';

-- The learner's state: the first week is a shadow (everything new "not sure yet"); the switch is off.
insert into public.settings (key, value, description) values
  ('memory_learner', jsonb_build_object('shadow_until', '2026-10-08', 'last_run', null), 'Casa''s memory: the nightly learner (shadow until the date: everything new is not sure yet)'),
  ('memory_private_on_wall', 'false'::jsonb, 'Casa''s memory: health, therapy and money facts said only on a phone (off: everything on the wall, as Jake asked for now)')
on conflict (key) do nothing;

-- Nightly at 3:30 AM Eastern (07:30 UTC): the function runs at most once in 20 hours, whoever calls.
select cron.unschedule(jobid) from cron.job where jobname = 'memory-learner';
select cron.schedule('memory-learner', '30 7 * * *', $$
  SELECT net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/memory-learner',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);
