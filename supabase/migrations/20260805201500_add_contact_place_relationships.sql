-- Places own addresses. Contacts connect to one or more canonical places.
create table if not exists public.contact_place_relationships (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.saved_contacts(id) on delete cascade,
  place_id uuid not null references public.saved_places(id) on delete cascade,
  relationship text not null default 'provider_location' check (length(trim(relationship)) > 0),
  is_default boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'derived')),
  confirmed boolean not null default false,
  confidence numeric(3, 2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, place_id, relationship)
);

alter table public.contact_place_relationships enable row level security;
create policy "allow all" on public.contact_place_relationships
  for all using (true) with check (true);
create unique index if not exists contact_place_relationships_default_idx
  on public.contact_place_relationships (contact_id)
  where is_default;
create index if not exists contact_place_relationships_place_idx
  on public.contact_place_relationships (place_id)
  where confirmed;
create trigger contact_place_relationships_updated_at
  before update on public.contact_place_relationships
  for each row execute function public.set_updated_at();

-- Compatibility backfill: every existing selected primary place remains the
-- default connection. No derived/unconfirmed data is promoted here.
insert into public.contact_place_relationships (
  contact_id, place_id, relationship, is_default, source, confirmed, confidence, evidence_count
)
select
  contact.id,
  contact.primary_place_id,
  'provider_location',
  true,
  coalesce(contact.primary_place_source, 'manual'),
  contact.confirmed,
  case when contact.confirmed then 1.00 else 0.70 end,
  coalesce(contact.occurrence_count, 0)
from public.saved_contacts contact
where contact.primary_place_id is not null
on conflict (contact_id, place_id, relationship) do update set
  is_default = true,
  confirmed = excluded.confirmed,
  confidence = greatest(
    public.contact_place_relationships.confidence,
    excluded.confidence
  ),
  updated_at = now();

create or replace function public.set_contact_place_relationship(
  p_contact_id uuid,
  p_place_id uuid,
  p_relationship text,
  p_is_default boolean default false,
  p_source text default 'manual',
  p_confirmed boolean default true,
  p_confidence numeric default 1.00,
  p_evidence_count integer default 0,
  p_evidence_notes text default null
) returns public.contact_place_relationships
language plpgsql
set search_path = public
as $$
declare
  saved public.contact_place_relationships;
begin
  if p_is_default then
    update public.contact_place_relationships
    set is_default = false, updated_at = now()
    where contact_id = p_contact_id and is_default;
  end if;

  insert into public.contact_place_relationships (
    contact_id, place_id, relationship, is_default, source, confirmed,
    confidence, evidence_count, evidence_notes
  ) values (
    p_contact_id, p_place_id, trim(p_relationship), p_is_default, p_source,
    p_confirmed, p_confidence, p_evidence_count, p_evidence_notes
  )
  on conflict (contact_id, place_id, relationship) do update set
    is_default = excluded.is_default,
    source = excluded.source,
    confirmed = excluded.confirmed,
    confidence = excluded.confidence,
    evidence_count = greatest(
      public.contact_place_relationships.evidence_count,
      excluded.evidence_count
    ),
    evidence_notes = coalesce(excluded.evidence_notes, public.contact_place_relationships.evidence_notes),
    updated_at = now()
  returning * into saved;

  if p_is_default then
    update public.saved_contacts
    set
      primary_place_id = p_place_id,
      primary_place_source = p_source,
      updated_at = now()
    where id = p_contact_id;
  end if;

  return saved;
end;
$$;

create or replace function public.delete_contact_place_relationship(
  p_relationship_id uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  removed public.contact_place_relationships;
begin
  delete from public.contact_place_relationships
  where id = p_relationship_id
  returning * into removed;

  if removed.id is not null and removed.is_default then
    update public.saved_contacts
    set
      primary_place_id = null,
      primary_place_source = null,
      updated_at = now()
    where id = removed.contact_id;
  end if;
end;
$$;

create or replace function public.clear_default_contact_place(
  p_contact_id uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.contact_place_relationships
  where contact_id = p_contact_id and is_default;

  update public.saved_contacts
  set
    primary_place_id = null,
    primary_place_source = null,
    updated_at = now()
  where id = p_contact_id;
end;
$$;
