-- Casa's memory, phase 5 — simpler people and places (design doc c1bc97e8): the old relationship rows become facts.
-- Who a contact is to a family member ("pediatric dentist: Wanuck, Hier & Associates") — sure when Jake confirmed it in
-- the old app, else not sure yet; health and therapy ones sensitive. A contact tied to a different place: a not-sure
-- fact about the contact. The tables stay (contact_directory still reads them for directions) and retire with P5.3.
insert into public.casa_memory (about_label, about_member_id, text, words, confidence, source, evidence, sensitive)
select distinct on (fm.id, sc.id)
  fm.name, fm.id,
  upper(left(btrim(r.relationship), 1)) || substr(btrim(r.relationship), 2) || ': ' || sc.name,
  array[sc.name],
  case when r.confirmed then 'sure' else 'not_sure' end,
  'learned',
  jsonb_build_array(jsonb_build_object('what', 'the old app''s contacts' || case when r.confirmed then ', confirmed' else '' end)),
  r.relationship ~* '(doctor|therap|pediatric|dent|ortho|derm|medical|clinic|counsel)'
from public.family_contact_relationships r
join public.family_members fm on fm.id = r.family_member_id
join public.saved_contacts sc on sc.id = r.contact_id and sc.dismissed_at is null
where r.dismissed_at is null and lower(btrim(r.relationship)) not in ('contact', '')
  and not exists (select 1 from public.casa_memory m where m.about_member_id = fm.id and lower(m.text) = lower(upper(left(btrim(r.relationship), 1)) || substr(btrim(r.relationship), 2) || ': ' || sc.name))
order by fm.id, sc.id, r.confirmed desc;

insert into public.casa_memory (about_label, text, words, confidence, source, evidence)
select distinct on (sc.id, sp.id) sc.name, 'At ' || sp.name || coalesce(', ' || nullif(sp.address, ''), ''), array[]::text[], 'not_sure', 'learned',
  jsonb_build_array(jsonb_build_object('what', 'the old app''s places'))
from public.contact_place_relationships r
join public.saved_contacts sc on sc.id = r.contact_id and sc.dismissed_at is null
join public.saved_places sp on sp.id = r.place_id
where r.dismissed_at is null and lower(sp.name) <> lower(sc.name) and position(lower(sc.name) in lower(sp.name)) = 0
  and not exists (select 1 from public.casa_memory m where m.about_label = sc.name and m.text like 'At ' || sp.name || '%');
