-- Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30): the offers he reviews with
-- Casa. An offer waits until he answers — Add it, Not needed, Later (back tomorrow morning) — and a skipped
-- email he's shown gets his "that one mattered" or "fine". Every answer is a label for training.
alter table public.email_offers add column if not exists feedback text check (feedback in ('mattered', 'fine'));
alter table public.email_offers add column if not exists later_until timestamptz;
alter table public.email_offers add column if not exists answered_at timestamptz;
create index if not exists email_offers_status_idx on public.email_offers (status);

-- Fresh offers (received in the last 3 days) wait for him; the September backlog stays a shadow.
update public.email_offers set status = 'waiting', updated_at = now()
where status = 'shadow' and decision in ('offer', 'details', 'person') and received_at > now() - interval '3 days';
