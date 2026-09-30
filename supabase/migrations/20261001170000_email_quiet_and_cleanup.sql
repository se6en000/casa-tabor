-- Casa reads the email, phases 3 and 4 (design doc, approved by Jake 2026-09-30; "go for it, all good").
--
-- Phase 3, learning: "Not needed quiets that kind of email from that sender." A quieted offer isn't dropped:
-- it goes to "a few I skipped" with its reason, and "That one mattered" brings it (and that sender) back.
alter table public.email_offers drop constraint if exists email_offers_status_check;
alter table public.email_offers add constraint email_offers_status_check
  check (status in ('shadow', 'waiting', 'added', 'not_needed', 'later', 'expired', 'quiet'));
alter table public.email_offers add column if not exists quieted_by uuid references public.email_offers(id) on delete set null;
create index if not exists email_offers_quieted_by_idx on public.email_offers (quieted_by);

-- Phase 4: email text is kept only while an offer is open, and never longer than 30 days. The email's own
-- words (quote) go; what Casa made of it (the reason, the offers, the sender and subject) stays as the label.
create or replace function public.purge_email_offer_text()
returns integer
language sql
security definer
set search_path to 'public'
as $$
  with cleared as (
    update public.email_offers
       set quote = null, updated_at = now()
     where quote is not null
       and (created_at < now() - interval '30 days'
            or (status not in ('waiting', 'later', 'quiet') and coalesce(answered_at, created_at) < now() - interval '1 day'))
    returning 1
  )
  select count(*)::integer from cleared
$$;
revoke all on function public.purge_email_offer_text() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-email-offer-text';
select cron.schedule('purge-email-offer-text', '40 3 * * *', $$select public.purge_email_offer_text();$$);

-- Phase 4: close the old scanner's open "needs you" items (107 on 2026-09-30; nothing on the new Wall or
-- phone reads them). Closed, not deleted: dismissed_reason says why, so it can be undone.
update public.prep_items
   set dismissed = true, dismissed_at = now(), dismissed_reason = 'old_email_scanner_retired'
 where source_type = 'gmail' and dismissed = false;
