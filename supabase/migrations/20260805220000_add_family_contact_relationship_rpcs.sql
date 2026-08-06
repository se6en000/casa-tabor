-- Manual management of family_contact_relationships (which family member is
-- linked to which contact/provider, e.g. "Liv's dermatologist"). This table
-- already existed and was populated by the AI's confirm-card flow, but had
-- no RPC for the household directory settings UI to manage it directly.
create or replace function public.set_family_contact_relationship(
  p_family_member_id uuid,
  p_contact_id uuid,
  p_relationship text,
  p_source text default 'manual',
  p_confirmed boolean default true,
  p_confidence numeric default 1.00,
  p_evidence_count integer default 0,
  p_evidence_notes text default null
) returns public.family_contact_relationships
language plpgsql
set search_path = public
as $$
declare
  saved public.family_contact_relationships;
begin
  insert into public.family_contact_relationships (
    family_member_id, contact_id, relationship, source, confirmed,
    confidence, evidence_count, evidence_notes
  ) values (
    p_family_member_id, p_contact_id, trim(p_relationship), p_source,
    p_confirmed, p_confidence, p_evidence_count, p_evidence_notes
  )
  on conflict (family_member_id, contact_id, relationship) do update set
    source = excluded.source,
    confirmed = excluded.confirmed,
    confidence = excluded.confidence,
    evidence_count = greatest(
      public.family_contact_relationships.evidence_count,
      excluded.evidence_count
    ),
    evidence_notes = coalesce(excluded.evidence_notes, public.family_contact_relationships.evidence_notes),
    updated_at = now()
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.delete_family_contact_relationship(
  p_relationship_id uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.family_contact_relationships
  where id = p_relationship_id;
end;
$$;
