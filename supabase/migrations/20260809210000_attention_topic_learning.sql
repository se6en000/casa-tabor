-- User-confirmed grouping corrections become durable rules. Signatures include
-- source, action kind, normalized topic text, and event date so learning does
-- not merge unrelated recurrences or broad vendor activity.

create table if not exists public.attention_topic_rules (
  signature text primary key,
  topic_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attention_topic_rules enable row level security;

drop policy if exists "attention topic rules are readable" on public.attention_topic_rules;
create policy "attention topic rules are readable"
  on public.attention_topic_rules for select
  using (true);

drop policy if exists "attention topic rules are writable" on public.attention_topic_rules;
create policy "attention topic rules are writable"
  on public.attention_topic_rules for all
  using (true)
  with check (true);
