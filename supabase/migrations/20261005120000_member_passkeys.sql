-- Face ID sign-in (canvas 40c, Jake Oct 5): a passkey per person per device, and the one-time challenges behind it.
-- Server-only (the assistant-history function, service role): RLS on, no policies.
create table if not exists public.member_passkeys (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists member_passkeys_member_id_idx on public.member_passkeys(member_id);
alter table public.member_passkeys enable row level security;

create table if not exists public.member_passkey_challenges (
  challenge text primary key,
  purpose text not null check (purpose in ('register', 'login')),
  member_id uuid references public.family_members(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists member_passkey_challenges_member_id_idx on public.member_passkey_challenges(member_id);
create index if not exists member_passkey_challenges_expires_at_idx on public.member_passkey_challenges(expires_at);
alter table public.member_passkey_challenges enable row level security;
