-- Phases 3–4 of Casa reads the email, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001170000_email_quiet_and_cleanup.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_old uuid; v_open uuid; v_new uuid; v_ans uuid;
begin
  if exists (select 1 from prep_items where source_type = 'gmail' and not dismissed) then raise exception 'FAIL 1 old items still open'; end if;
  if not exists (select 1 from prep_items where dismissed_reason = 'old_email_scanner_retired') then raise exception 'FAIL 1 none closed'; end if;
  if not exists (select 1 from cron.job where jobname = 'purge-email-offer-text' and active) then raise exception 'FAIL 2 no purge job'; end if;

  insert into email_offers (gmail_message_id, decision, status, quote, created_at) values ('ZZ-old', 'offer', 'waiting', 'the words', now() - interval '31 days') returning id into v_old;
  insert into email_offers (gmail_message_id, decision, status, quote) values ('ZZ-open', 'offer', 'waiting', 'the words') returning id into v_open;
  insert into email_offers (gmail_message_id, decision, status, quote) values ('ZZ-new-answer', 'offer', 'not_needed', 'the words') returning id into v_new;
  update email_offers set answered_at = now() where id = v_new;
  insert into email_offers (gmail_message_id, decision, status, quote, answered_at) values ('ZZ-answered', 'offer', 'added', 'the words', now() - interval '2 days') returning id into v_ans;
  perform purge_email_offer_text();
  if (select quote from email_offers where id = v_old) is not null then raise exception 'FAIL 3 older than 30 days kept'; end if;
  if (select quote from email_offers where id = v_open) is null then raise exception 'FAIL 4 an open offer lost its words'; end if;
  if (select quote from email_offers where id = v_new) is null then raise exception 'FAIL 5 answered today lost its words already'; end if;
  if (select quote from email_offers where id = v_ans) is not null then raise exception 'FAIL 6 answered two days ago kept'; end if;
  if (select reason is not distinct from reason from email_offers where id = v_ans) is not true then raise exception 'FAIL 6 reason'; end if;

  update email_offers set status = 'quiet', quieted_by = v_new where id = v_open;
  raise exception 'ALL PASSED';
end $$;
