-- Consolidate legacy observations into profile-aware canonical memory.

insert into public.ai_memories (
  id,
  scope,
  owner_member_id,
  extractor_version,
  title,
  content,
  category,
  confidence,
  status,
  created_at,
  updated_at
)
select
  id,
  'household',
  null,
  'legacy-observation-v1',
  title,
  coalesce(nullif(details, ''), title),
  case category
    when 'habit' then 'routine'
    when 'preference' then 'preference'
    when 'family_pattern' then 'preference'
    else 'constraint'
  end,
  coalesce(confidence, 0.8),
  -- The current product contract auto-accepts stable memory without an approval
  -- queue, so previously user-visible review rows remain available after cutover.
  case when status = 'archived' then 'deleted' else 'active' end,
  created_at,
  updated_at
from public.ai_memory_observations
on conflict (id) do nothing;

drop trigger if exists family_data_project_ai_memory_observations on public.ai_memory_observations;

drop trigger if exists family_data_project_ai_memories on public.ai_memories;
create trigger family_data_project_ai_memories
after insert or update or delete on public.ai_memories
for each row execute function public.enqueue_family_generic_projection('memory', '');

insert into public.family_data_index_queue (source_type, source_id, operation, status)
select 'memory', id::text, 'upsert', 'pending'
from public.ai_memories
where status = 'active' and scope = 'household'
on conflict (source_type, source_id) do update set
  operation = 'upsert',
  status = 'pending',
  available_at = now(),
  updated_at = now();
