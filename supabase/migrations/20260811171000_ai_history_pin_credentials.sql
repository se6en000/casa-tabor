create table if not exists public.ai_history_pin_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_kind text not null check (credential_kind in ('household_admin', 'family_member')),
  member_id uuid references public.family_members(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  pin_iterations integer not null check (pin_iterations >= 100000),
  credential_version integer not null default 1 check (credential_version > 0),
  failed_attempt_count integer not null default 0 check (failed_attempt_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (credential_kind = 'household_admin' and member_id is null)
    or (credential_kind = 'family_member' and member_id is not null)
  )
);

create unique index if not exists ai_history_pin_admin_unique_idx
  on public.ai_history_pin_credentials (credential_kind)
  where credential_kind = 'household_admin';

create unique index if not exists ai_history_pin_member_unique_idx
  on public.ai_history_pin_credentials (member_id)
  where credential_kind = 'family_member';

alter table public.ai_history_pin_credentials enable row level security;

drop policy if exists "ai history PIN credentials service role only" on public.ai_history_pin_credentials;
create policy "ai history PIN credentials service role only"
  on public.ai_history_pin_credentials
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists ai_history_pin_credentials_updated_at on public.ai_history_pin_credentials;
create trigger ai_history_pin_credentials_updated_at
  before update on public.ai_history_pin_credentials
  for each row execute function public.set_updated_at();
