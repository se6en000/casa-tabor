do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'process-google-sync-jobs'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'process-google-sync-jobs',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/process-google-sync-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"limit":10}'::jsonb
  );
  $$
);
