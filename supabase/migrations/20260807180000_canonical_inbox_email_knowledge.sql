-- Canonical inbox records deduplicate copies of the same email delivered to
-- multiple connected family Gmail accounts. Raw message content remains in the
-- per-recipient processing log; canonical rows retain only safe identity data.
create table if not exists public.canonical_inbox_emails (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  gmail_thread_id text,
  internet_message_id text,
  from_email text,
  subject text,
  received_at timestamptz,
  content_fingerprint text not null,
  content_format text not null check (content_format in ('plain', 'html', 'none')),
  attachment_count integer not null default 0 check (attachment_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists canonical_inbox_emails_thread_idx
  on public.canonical_inbox_emails(gmail_thread_id)
  where gmail_thread_id is not null;

alter table public.gmail_processed_messages
  add column if not exists canonical_email_id uuid
  references public.canonical_inbox_emails(id) on delete set null;

create index if not exists gmail_processed_messages_canonical_email_idx
  on public.gmail_processed_messages(canonical_email_id)
  where canonical_email_id is not null;

-- Source-backed knowledge is intentionally compact: operational facts expire,
-- and durable relationships require explicit confirmation before graph use.
create table if not exists public.family_knowledge_claims (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null unique,
  claim_type text not null check (claim_type in ('commitment', 'fact', 'relationship')),
  status text not null default 'active' check (status in ('active', 'review', 'superseded', 'expired', 'dismissed')),
  requiredness text not null default 'fyi' check (requiredness in ('required', 'optional', 'fyi')),
  privacy_class text not null default 'standard' check (privacy_class in ('standard', 'sensitive')),
  title text not null,
  summary text,
  family_member_id uuid references public.family_members(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  prep_item_id uuid references public.prep_items(id) on delete set null,
  canonical_email_id uuid not null references public.canonical_inbox_emails(id) on delete cascade,
  effective_at timestamptz,
  expires_at timestamptz,
  confidence numeric(4,3) not null default 0.8 check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  superseded_by uuid references public.family_knowledge_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_knowledge_claims_active_idx
  on public.family_knowledge_claims(status, requiredness, expires_at);
create index if not exists family_knowledge_claims_member_idx
  on public.family_knowledge_claims(family_member_id)
  where family_member_id is not null;
create index if not exists family_knowledge_claims_canonical_email_idx
  on public.family_knowledge_claims(canonical_email_id);

alter table public.canonical_inbox_emails enable row level security;
alter table public.family_knowledge_claims enable row level security;

create policy "canonical inbox emails service access"
  on public.canonical_inbox_emails for all using (true) with check (true);
create policy "family knowledge claims service access"
  on public.family_knowledge_claims for all using (true) with check (true);

drop trigger if exists family_knowledge_claims_updated_at on public.family_knowledge_claims;
create trigger family_knowledge_claims_updated_at
  before update on public.family_knowledge_claims
  for each row execute function public.set_updated_at();
