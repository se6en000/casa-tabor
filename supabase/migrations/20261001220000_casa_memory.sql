-- Casa's memory, phase 1 (design doc https://claude.ai/code/artifact/c1bc97e8-3b45-4c9f-b005-7a06d57d7db6; Jake,
-- 2026-09-30: "ok lets build it"). One list of short facts about the people, places and things in the family's
-- life — and open thoughts he asked Casa to keep — each with where it came from and how sure Casa is. His words
-- win and corrections stick: a corrected or forgotten fact is kept, so it's never learned again.
create table if not exists public.casa_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'fact' check (kind in ('fact', 'thought')),
  -- Who or what it's about: a family member, or anyone/anything by name ("The kids", "Coach Glen", "the house").
  about_label text not null,
  about_member_id uuid references public.family_members(id) on delete set null,
  text text not null,
  -- What on a flyer or in an email points to it ("Bak", "Kindergarten", "Huskies").
  words text[] not null default '{}',
  confidence text not null default 'sure' check (confidence in ('sure', 'not_sure')),
  status text not null default 'active' check (status in ('active', 'corrected', 'forgotten', 'done')),
  source text not null default 'told' check (source in ('told', 'learned', 'old_app')),
  evidence jsonb not null default '[]'::jsonb,
  said_by text,
  replaces uuid references public.casa_memory(id) on delete set null,
  last_nudged_at timestamptz,
  nudge_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists casa_memory_about_member_idx on public.casa_memory (about_member_id);
create index if not exists casa_memory_replaces_idx on public.casa_memory (replaces);
create index if not exists casa_memory_status_idx on public.casa_memory (status, kind);
alter table public.casa_memory enable row level security;

-- Remember (or correct): his words, sure at once. A correction marks what it replaces as corrected.
create or replace function public.casa_memory_remember(p_about text, p_member uuid, p_text text, p_kind text default 'fact', p_words text[] default '{}', p_replaces uuid default null, p_said_by text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_old text;
begin
  if nullif(btrim(p_text), '') is null or nullif(btrim(p_about), '') is null then raise exception 'Remember what, about whom?'; end if;
  if p_replaces is not null then
    update public.casa_memory set status = 'corrected', updated_at = now() where id = p_replaces and status = 'active' returning text into v_old;
  end if;
  insert into public.casa_memory (kind, about_label, about_member_id, text, words, confidence, status, source, evidence, said_by, replaces)
  values (coalesce(p_kind, 'fact'), btrim(p_about), p_member, btrim(p_text), coalesce(p_words, '{}'), 'sure', 'active', 'told',
          jsonb_build_array(jsonb_build_object('what', coalesce(p_said_by, 'You') || ' said it', 'when', to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))),
          p_said_by, case when v_old is not null then p_replaces end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'replaced', v_old);
end $$;

-- Forget a fact for good ("forget the orthodontist thing"), or close a thought (done / dropped).
create or replace function public.casa_memory_forget(p_id uuid, p_status text default 'forgotten')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_text text;
begin
  update public.casa_memory set status = case when p_status = 'done' then 'done' else 'forgotten' end, updated_at = now()
  where id = p_id and status = 'active' returning text into v_text;
  return jsonb_build_object('ok', v_text is not null, 'text', v_text);
end $$;

-- "Undo that": the last change taken back — what it replaced is active again.
create or replace function public.casa_memory_undo(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_row public.casa_memory%rowtype;
begin
  update public.casa_memory set status = 'forgotten', updated_at = now() where id = p_id and status = 'active' returning * into v_row;
  if v_row.id is null then
    -- Undoing a forget: back to active.
    update public.casa_memory set status = 'active', updated_at = now() where id = p_id and status in ('forgotten', 'done') returning * into v_row;
    return jsonb_build_object('ok', v_row.id is not null, 'restored', v_row.text);
  end if;
  if v_row.replaces is not null then update public.casa_memory set status = 'active', updated_at = now() where id = v_row.replaces and status = 'corrected'; end if;
  return jsonb_build_object('ok', true, 'removed', v_row.text);
end $$;

revoke all on function public.casa_memory_remember(text, uuid, text, text, text[], uuid, text) from public, anon, authenticated;
revoke all on function public.casa_memory_forget(uuid, text) from public, anon, authenticated;
revoke all on function public.casa_memory_undo(uuid) from public, anon, authenticated;

-- Day one: what Jake told the old app on 2026-08-04 (never read until now), and what he said on 2026-09-30.
insert into public.casa_memory (about_label, about_member_id, text, words, source, evidence, said_by)
select v.about, (select id from public.family_members where name = v.member), v.text, v.words, v.source, v.evidence::jsonb, 'Jake'
from (values
  ('Owen', 'Owen', 'Goes to Palm Beach Public, in Palm Beach', array['Palm Beach Public'], 'old_app', '[{"what":"Jake told the old app","when":"2026-08-04"}]'),
  ('Emme', 'Emme', 'Goes to Palm Beach Public, in Palm Beach', array['Palm Beach Public'], 'old_app', '[{"what":"Jake told the old app","when":"2026-08-04"}]'),
  ('Liv', 'Liv', 'Goes to Bak Middle School of the Arts, in West Palm Beach', array['Bak', 'BAK Middle'], 'old_app', '[{"what":"Jake told the old app","when":"2026-08-04"}]'),
  ('The kids', null, 'Dentist: Dr. Wanuk (in saved places)', array['dentist', 'Wanuk'], 'old_app', '[{"what":"Jake told the old app","when":"2026-08-04"}]'),
  ('The kids', null, 'Orthodontist: McCranels Orthodontics, West Palm Beach (in saved places)', array['orthodontist', 'orthodontics', 'McCranels'], 'old_app', '[{"what":"Jake told the old app","when":"2026-08-04"}]'),
  ('Owen', 'Owen', 'In kindergarten', array['Kindergarten', 'Kindergarten by the Sea'], 'told', '[{"what":"Jake said it","when":"2026-09-30"}]'),
  ('Emme', 'Emme', 'In 4th grade', array['4th grade', 'fourth grade'], 'told', '[{"what":"Jake said it","when":"2026-09-30"}]'),
  ('Liv', 'Liv', 'Plays softball', array['softball'], 'told', '[{"what":"Jake said it","when":"2026-09-30"}]'),
  ('Milo', 'Milo', 'A family pet, not a person', array[]::text[], 'told', '[{"what":"Jake said it","when":"2026-09-30"}]'),
  ('Tabor Family', 'Tabor Family', 'An email box (the family''s Gmail), not a person', array[]::text[], 'told', '[{"what":"Jake said it","when":"2026-09-30"}]')
) as v(about, member, text, words, source, evidence)
where not exists (select 1 from public.casa_memory m where m.about_label = v.about and m.text = v.text);
