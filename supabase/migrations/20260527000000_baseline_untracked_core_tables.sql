-- Baseline for tables that were created in the Supabase dashboard before
-- migrations were tracked (reconstructed 2026-09-25 from the live schema).
--
-- This creates each table in its pre-history shape: everything that exists in
-- production today EXCEPT the columns, constraints, indexes, policies and
-- triggers that later migrations in this folder add themselves. Replaying all
-- migrations in order on an empty database therefore rebuilds production.
--
-- Recorded as already applied in production (migration repair); it was never
-- executed against the live database. Idempotent so it is safe either way.

-- Enums ----------------------------------------------------------------------
do $$ begin create type public.conflict_type as enum ('overlap', 'drive_time', 'double_book', 'gear_conflict'); exception when duplicate_object then null; end $$;
do $$ begin create type public.enrichment_confidence as enum ('high', 'medium', 'low'); exception when duplicate_object then null; end $$;
do $$ begin create type public.event_status as enum ('confirmed', 'tentative', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.family_role as enum ('parent', 'child', 'caregiver'); exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_type as enum ('morning_briefing', 'departure_alert', 'conflict_alert', 'weather_alert', 'reminder', 'coordination_request', 'acknowledgment'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sms_direction as enum ('inbound', 'outbound'); exception when duplicate_object then null; end $$;
do $$ begin create type public.voice_intent as enum ('add_event', 'query_schedule', 'check_conflict', 'send_message', 'assign_task', 'get_briefing', 'update_event', 'delete_event', 'weather_check', 'unknown'); exception when duplicate_object then null; end $$;

-- Shared trigger function ----------------------------------------------------
create or replace function public.update_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Tables ---------------------------------------------------------------------
create table if not exists public.family_members (
  id uuid not null default gen_random_uuid(),
  name text not null,
  full_name text,
  role public.family_role not null default 'child'::public.family_role,
  color_hex text not null,
  color_name text not null,
  phone text,
  email text,
  google_calendar_id text,
  is_admin boolean not null default false,
  avatar_url text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint family_members_pkey primary key (id)
);

-- 20260528000200_gmail_scan alters google_tokens one step before
-- 20260528000300_google_tokens creates it; production had the table first.
-- Same definition as that migration, so its create-if-not-exists is a no-op.
create table if not exists public.google_tokens (
  family_member_id uuid primary key references public.family_members(id) on delete cascade,
  google_email text not null,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scope text not null,
  sync_token text,
  last_sync_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_tokens enable row level security;

create table if not exists public.venues (
  id uuid not null default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  parking_notes text,
  entrance_notes text,
  contact_name text,
  contact_phone text,
  default_gear text[],
  visit_count integer not null default 0,
  last_visited_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  category text,
  drive_time_from_home_min integer,
  constraint venues_pkey primary key (id)
);

create table if not exists public.events (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  all_day boolean not null default false,
  location_name text,
  address text,
  lat double precision,
  lng double precision,
  google_event_id text,
  google_calendar_id text,
  source_member_id uuid,
  recurrence_rule text,
  status public.event_status not null default 'confirmed'::public.event_status,
  color_override text,
  is_enriched boolean not null default false,
  raw_google_json jsonb,
  synced_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  venue_id uuid,
  category text,
  tags text[],
  recurrence_master_id uuid,
  constraint events_pkey primary key (id),
  constraint events_google_event_id_key unique (google_event_id),
  constraint events_end_after_start_check check ((end_time >= start_time)),
  constraint events_source_member_id_fkey foreign key (source_member_id) references public.family_members(id),
  constraint events_venue_id_fkey foreign key (venue_id) references public.venues(id),
  constraint events_recurrence_master_id_fkey foreign key (recurrence_master_id) references public.events(id) on delete cascade
);

create table if not exists public.event_members (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  family_member_id uuid not null,
  role text default 'attendee'::text,
  rsvp_status text default 'accepted'::text,
  created_at timestamp with time zone not null default now(),
  constraint event_members_pkey primary key (id),
  constraint event_members_event_id_family_member_id_key unique (event_id, family_member_id),
  constraint event_members_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_members_family_member_id_fkey foreign key (family_member_id) references public.family_members(id) on delete cascade
);

create table if not exists public.event_enrichments (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  drive_time_mins integer,
  departure_time timestamp with time zone,
  route_summary text,
  weather_at_event jsonb,
  what_to_bring text[],
  prep_notes text,
  outfit_suggestion text,
  parking_notes text,
  confidence public.enrichment_confidence default 'medium'::public.enrichment_confidence,
  enriched_by text default 'claude'::text,
  enriched_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  weather_summary text,
  dietary_notes text,
  cost_estimate text,
  contact_name text,
  contact_phone text,
  meal_impact text,
  category text,
  constraint event_enrichments_pkey primary key (id),
  constraint event_enrichments_event_id_key unique (event_id),
  constraint event_enrichments_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade
);

create table if not exists public.event_logistics (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  sort_order integer not null default 0,
  step_type text not null default 'note'::text,
  icon text,
  title text not null,
  description text,
  "time" timestamp with time zone,
  location_name text,
  address text,
  created_at timestamp with time zone not null default now(),
  constraint event_logistics_pkey primary key (id),
  constraint event_logistics_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade
);

create table if not exists public.event_checklist_items (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  label text not null,
  note text,
  checked boolean not null default false,
  category text not null default 'gear'::text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint event_checklist_items_pkey primary key (id),
  constraint event_checklist_items_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade
);

create table if not exists public.event_action_items (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  title text not null,
  description text,
  due_date date,
  is_urgent boolean not null default false,
  completed boolean not null default false,
  completed_at timestamp with time zone,
  assigned_to uuid,
  created_at timestamp with time zone not null default now(),
  constraint event_action_items_pkey primary key (id),
  constraint event_action_items_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_action_items_assigned_to_fkey foreign key (assigned_to) references public.family_members(id)
);

create table if not exists public.conflicts (
  id uuid not null default gen_random_uuid(),
  event_a_id uuid not null,
  event_b_id uuid,
  conflict_type public.conflict_type not null,
  severity integer not null default 1,
  description text,
  resolved boolean not null default false,
  resolution text,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone not null default now(),
  constraint conflicts_pkey primary key (id),
  constraint conflicts_event_a_id_event_b_id_key unique (event_a_id, event_b_id),
  constraint conflicts_event_a_id_fkey foreign key (event_a_id) references public.events(id) on delete cascade,
  constraint conflicts_event_b_id_fkey foreign key (event_b_id) references public.events(id) on delete cascade,
  constraint conflicts_resolved_by_fkey foreign key (resolved_by) references public.family_members(id)
);

create table if not exists public.daily_briefings (
  id uuid not null default gen_random_uuid(),
  briefing_date date not null,
  content_json jsonb not null,
  summary_text text not null,
  member_schedules jsonb,
  conflicts jsonb,
  weather_summary jsonb,
  sms_sent_at timestamp with time zone,
  generated_by text default 'claude'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint daily_briefings_pkey primary key (id),
  constraint daily_briefings_briefing_date_key unique (briefing_date)
);

create table if not exists public.settings (
  key text not null,
  value jsonb not null,
  description text,
  updated_at timestamp with time zone not null default now(),
  constraint settings_pkey primary key (key)
);

create table if not exists public.sync_state (
  id uuid not null default gen_random_uuid(),
  google_calendar_id text not null,
  family_member_id uuid,
  last_sync_token text,
  last_synced_at timestamp with time zone,
  events_synced integer default 0,
  error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint sync_state_pkey primary key (id),
  constraint sync_state_google_calendar_id_key unique (google_calendar_id),
  constraint sync_state_family_member_id_fkey foreign key (family_member_id) references public.family_members(id)
);

create table if not exists public.voice_sessions (
  id uuid not null default gen_random_uuid(),
  transcript text,
  intent public.voice_intent,
  confidence double precision,
  action_taken text,
  response_text text,
  duration_ms integer,
  audio_url text,
  family_member_id uuid,
  related_event_id uuid,
  error text,
  created_at timestamp with time zone not null default now(),
  constraint voice_sessions_pkey primary key (id),
  constraint voice_sessions_family_member_id_fkey foreign key (family_member_id) references public.family_members(id),
  constraint voice_sessions_related_event_id_fkey foreign key (related_event_id) references public.events(id)
);

-- sms_log and sensor_readings: production has the original dashboard-built
-- tables. The later migrations that "create" them (20260528000500,
-- 20260608000100) use create-if-not-exists, so they leave these alone, as in
-- production. Hand-added sensor_readings columns come in 20260925170000.
create table if not exists public.sms_log (
  id uuid not null default gen_random_uuid(),
  direction public.sms_direction not null,
  phone text not null,
  family_member_id uuid,
  body text not null,
  twilio_sid text,
  notification_type public.notification_type,
  intent_parsed public.voice_intent,
  action_taken text,
  related_event_id uuid,
  error text,
  created_at timestamp with time zone not null default now(),
  constraint sms_log_pkey primary key (id),
  constraint sms_log_family_member_id_fkey foreign key (family_member_id) references public.family_members(id),
  constraint sms_log_related_event_id_fkey foreign key (related_event_id) references public.events(id)
);
create index if not exists idx_sms_log_phone on public.sms_log using btree (phone);
create index if not exists idx_sms_log_member on public.sms_log using btree (family_member_id);
create index if not exists idx_sms_log_created on public.sms_log using btree (created_at desc);
create index if not exists idx_sms_log_related_event on public.sms_log using btree (related_event_id) where (related_event_id is not null);

create table if not exists public.sensor_readings (
  id uuid not null default gen_random_uuid(),
  lux double precision,
  temperature_f double precision,
  humidity double precision,
  pressure_hpa double precision,
  pir_triggered boolean default false,
  brightness_set integer,
  color_temp_set integer,
  created_at timestamp with time zone not null default now(),
  constraint sensor_readings_pkey primary key (id)
);
create index if not exists idx_sensor_created on public.sensor_readings using btree (created_at desc);

-- Indexes not created by any later migration ---------------------------------
create index if not exists idx_conflicts_event_b on public.conflicts using btree (event_b_id) where (event_b_id is not null);
create index if not exists idx_conflicts_unresolved on public.conflicts using btree (resolved) where (resolved = false);
create index if not exists idx_briefings_date on public.daily_briefings using btree (briefing_date desc);
create index if not exists idx_events_category on public.events using btree (category);
create index if not exists idx_events_date_range on public.events using btree (start_time, end_time);
create index if not exists idx_events_end on public.events using btree (end_time);
create index if not exists idx_events_recurrence_master on public.events using btree (recurrence_master_id) where (recurrence_master_id is not null);
create index if not exists idx_events_source_member on public.events using btree (source_member_id);
create index if not exists idx_events_start on public.events using btree (start_time);
create index if not exists idx_events_venue on public.events using btree (venue_id);
create index if not exists idx_venues_name on public.venues using btree (name);
create index if not exists idx_voice_sessions_created on public.voice_sessions using btree (created_at desc);
create index if not exists idx_voice_sessions_related_event on public.voice_sessions using btree (related_event_id) where (related_event_id is not null);

-- updated_at triggers not created by any later migration ---------------------
drop trigger if exists trg_family_members_updated on public.family_members;
create trigger trg_family_members_updated before update on public.family_members for each row execute function public.update_updated_at();
drop trigger if exists trg_venues_updated on public.venues;
create trigger trg_venues_updated before update on public.venues for each row execute function public.update_updated_at();
drop trigger if exists trg_events_updated on public.events;
create trigger trg_events_updated before update on public.events for each row execute function public.update_updated_at();
drop trigger if exists trg_enrichments_updated on public.event_enrichments;
create trigger trg_enrichments_updated before update on public.event_enrichments for each row execute function public.update_updated_at();
drop trigger if exists trg_briefings_updated on public.daily_briefings;
create trigger trg_briefings_updated before update on public.daily_briefings for each row execute function public.update_updated_at();
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings for each row execute function public.update_updated_at();
drop trigger if exists trg_sync_state_updated on public.sync_state;
create trigger trg_sync_state_updated before update on public.sync_state for each row execute function public.update_updated_at();

-- Row level security (policies are created by later migrations) -------------
alter table public.family_members enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.event_enrichments enable row level security;
alter table public.event_logistics enable row level security;
alter table public.event_checklist_items enable row level security;
alter table public.event_action_items enable row level security;
alter table public.conflicts enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.settings enable row level security;
alter table public.sync_state enable row level security;
alter table public.voice_sessions enable row level security;
alter table public.sms_log enable row level security;
alter table public.sensor_readings enable row level security;
