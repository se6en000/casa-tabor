create or replace function public.search_family_data(
  query_text text,
  query_embedding extensions.vector(768) default null,
  query_entities text[] default '{}'::text[],
  query_start timestamptz default null,
  query_end timestamptz default null,
  requested_source_types text[] default null,
  include_history boolean default false,
  match_count integer default 30
)
returns table (
  document_id uuid,
  chunk_id uuid,
  source_type text,
  source_id text,
  title text,
  excerpt text,
  category text,
  entity_refs jsonb,
  occurred_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  confidence numeric,
  metadata jsonb,
  semantic_score double precision,
  lexical_score double precision,
  entity_score double precision,
  temporal_score double precision,
  recency_score double precision,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scored as (
    select
      document.id as document_id,
      chunk.id as chunk_id,
      document.source_type,
      document.source_id,
      document.title,
      chunk.redacted_text as excerpt,
      document.category,
      document.entity_refs,
      document.occurred_at,
      document.effective_at,
      document.expires_at,
      document.confidence,
      document.metadata,
      case
        when query_embedding is null or chunk.embedding is null then 0::double precision
        else greatest(0::double precision, 1 - (chunk.embedding <=> query_embedding))
      end as semantic_score,
      ts_rank_cd(
        chunk.search_vector,
        websearch_to_tsquery('english', coalesce(query_text, ''))
      )::double precision as lexical_score,
      case
        when cardinality(query_entities) = 0 then 0::double precision
        when exists (
          select 1
          from unnest(query_entities) as entity
          where lower(document.entity_refs::text) like '%' || lower(entity) || '%'
             or lower(document.title) like '%' || lower(entity) || '%'
        ) then 1::double precision
        else 0::double precision
      end as entity_score,
      case
        when query_start is not null and coalesce(document.effective_at, document.occurred_at) >= query_start
          and (query_end is null or coalesce(document.effective_at, document.occurred_at) <= query_end)
          then 1::double precision
        when query_start is null
          and coalesce(document.effective_at, document.occurred_at) between now() - interval '7 days' and now() + interval '30 days'
          then 0.8::double precision
        else 0.2::double precision
      end as temporal_score,
      exp(
        -greatest(
          0::double precision,
          extract(epoch from (now() - coalesce(document.occurred_at, document.effective_at, document.updated_at))) / 86400
        ) / 60
      )::double precision as recency_score
    from public.family_data_chunks as chunk
    join public.family_data_documents as document on document.id = chunk.document_id
    where document.status = 'active'
      and document.privacy_class = 'standard'
      and (requested_source_types is null or document.source_type = any(requested_source_types))
      and (
        include_history
        or document.expires_at is null
        or document.expires_at > now()
      )
  )
  select
    scored.document_id,
    scored.chunk_id,
    scored.source_type,
    scored.source_id,
    scored.title,
    scored.excerpt,
    scored.category,
    scored.entity_refs,
    scored.occurred_at,
    scored.effective_at,
    scored.expires_at,
    scored.confidence,
    scored.metadata,
    scored.semantic_score,
    scored.lexical_score,
    scored.entity_score,
    scored.temporal_score,
    scored.recency_score,
    (
      scored.semantic_score * 0.45 +
      least(scored.lexical_score, 1) * 0.20 +
      scored.entity_score * 0.15 +
      scored.temporal_score * 0.10 +
      scored.recency_score * 0.05 +
      scored.confidence::double precision * 0.05
    ) as score
  from scored
  where scored.semantic_score > 0
     or scored.lexical_score > 0
     or scored.entity_score > 0
  order by score desc, scored.effective_at desc nulls last, scored.occurred_at desc nulls last
  limit greatest(1, least(match_count, 100));
$$;

revoke all on function public.search_family_data(
  text,
  extensions.vector,
  text[],
  timestamptz,
  timestamptz,
  text[],
  boolean,
  integer
) from public;
grant execute on function public.search_family_data(
  text,
  extensions.vector,
  text[],
  timestamptz,
  timestamptz,
  text[],
  boolean,
  integer
) to service_role;
