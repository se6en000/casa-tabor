-- A relationship belongs to a family member and contact, not to the contact
-- globally. This keeps "Liv's orthodontist" distinct from a provider's role.
create table if not exists public.family_contact_relationships (
  id uuid primary key default gen_random_uuid(),
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  contact_id uuid not null references public.saved_contacts(id) on delete cascade,
  relationship text not null check (length(trim(relationship)) > 0),
  source text not null default 'manual' check (source in ('manual', 'derived')),
  confirmed boolean not null default false,
  confidence numeric(3, 2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_member_id, contact_id, relationship)
);

alter table public.family_contact_relationships enable row level security;
create policy "allow all" on public.family_contact_relationships
  for all using (true) with check (true);

create index if not exists family_contact_relationships_member_idx
  on public.family_contact_relationships (family_member_id)
  where confirmed = true;
create index if not exists family_contact_relationships_contact_idx
  on public.family_contact_relationships (contact_id)
  where confirmed = true;

create trigger family_contact_relationships_updated_at
  before update on public.family_contact_relationships
  for each row execute function public.set_updated_at();

-- User-confirmed relationships reviewed from calendar history. "Manual" means
-- explicitly approved by the household, even where calendar events supplied
-- the original evidence.
with relationship_seed(member_name, contact_name, relationship, evidence_count, evidence_notes) as (
  values
    ('Liv', 'Coach Glen', 'coach', 2, 'Confirmed by household: Liv is coached by Coach Glen; Jake only drives.'),
    ('Owen', 'Hope Center for Behavior Change', 'therapist', 1, 'Confirmed from Owen''s Therapy Pickup event.'),
    ('Liv', 'Dr George', 'dermatologist', 1, 'Confirmed from Liv''s dermatology appointment.'),
    ('Emme', 'Wanuck, Hier & Associates', 'pediatric dentist', 1, 'Confirmed from Emme & Liv Dentist Dr Wanuck event.'),
    ('Liv', 'Wanuck, Hier & Associates', 'pediatric dentist', 1, 'Confirmed from Emme & Liv Dentist Dr Wanuck event.'),
    ('Emme', 'McCranels Orthodontics', 'orthodontist', 1, 'Confirmed from Emme''s orthodontics appointment.'),
    ('Owen', 'Wanuck, Hier & Associates', 'pediatric dentist', 1, 'Confirmed from Owen''s pediatric dentist appointment.')
)
insert into public.family_contact_relationships (
  family_member_id, contact_id, relationship, source, confirmed, confidence, evidence_count, evidence_notes
)
select
  member.id,
  contact.id,
  seed.relationship,
  'manual',
  true,
  1.00,
  seed.evidence_count,
  seed.evidence_notes
from relationship_seed seed
join public.family_members member on lower(member.name) = lower(seed.member_name)
join public.saved_contacts contact on lower(contact.name) = lower(seed.contact_name)
on conflict (family_member_id, contact_id, relationship) do update set
  source = excluded.source,
  confirmed = excluded.confirmed,
  confidence = excluded.confidence,
  evidence_count = greatest(
    public.family_contact_relationships.evidence_count,
    excluded.evidence_count
  ),
  evidence_notes = excluded.evidence_notes,
  updated_at = now();

-- These two confirmed providers had no canonical destination yet.
with contact_place_seed(contact_name, place_name) as (
  values
    ('Coach Glen', 'Vivian A. Ferrin Memorial Park'),
    ('Dr George', 'Dr George - Dermatology')
)
update public.saved_contacts contact
set
  primary_place_id = place.id,
  primary_place_source = 'manual'
from contact_place_seed seed
join public.saved_places place on lower(place.name) = lower(seed.place_name)
where lower(contact.name) = lower(seed.contact_name);
