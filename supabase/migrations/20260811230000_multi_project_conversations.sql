alter table public.ai_projects
  drop constraint if exists ai_projects_owner_member_id_source_conversation_id_key;

alter table public.ai_projects
  add column if not exists topic_key text;

update public.ai_projects
set topic_key = trim(both '-' from lower(regexp_replace(btrim(title), '[^a-z0-9]+', '-', 'g')))
where topic_key is null;

alter table public.ai_projects
  alter column topic_key set not null;

create unique index if not exists ai_projects_conversation_topic_idx
  on public.ai_projects (owner_member_id, source_conversation_id, topic_key)
  where status <> 'deleted';
