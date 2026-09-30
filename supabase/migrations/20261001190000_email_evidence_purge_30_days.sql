-- Casa reads the email, phase 4 (design doc: "Email text is kept only while an offer is open, and no longer than
-- 30 days. The old purge job for this exists, but it is switched off; turn it back on."). Jake, 2026-09-30:
-- "sure finish it" — knowing it permanently deletes the old scanner's email records older than 30 days (884
-- that day) that the assistant could search. Their chunks go with them (on delete cascade).
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'purge-expired-family-email-evidence'),
  command := $$select public.purge_expired_family_email_evidence(interval '30 days');$$,
  active := true
);
