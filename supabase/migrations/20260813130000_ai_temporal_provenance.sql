alter table public.ai_memories
  add column if not exists temporal_evidence jsonb;

alter table public.ai_projects
  add column if not exists temporal_evidence jsonb;

alter table public.ai_project_items
  add column if not exists temporal_evidence jsonb;

alter table public.ai_project_items
  add column if not exists calendar_event_id uuid references public.events(id) on delete set null;

comment on column public.ai_memories.temporal_evidence is
  'User-authored explicit or deterministically resolved date evidence. Null is not calendar authority.';
comment on column public.ai_projects.temporal_evidence is
  'Source-message date/range provenance for planning context. Null means the project is undated.';
comment on column public.ai_project_items.temporal_evidence is
  'Source-message date/range provenance. Undated draft tasks retain null due_at and null temporal_evidence.';
