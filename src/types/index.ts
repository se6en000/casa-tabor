// ── Family ──────────────────────────────────────────────────

export type FamilyRole = 'parent' | 'child' | 'caregiver'

export interface FamilyMember {
  id: string
  name: string
  full_name: string | null
  role: FamilyRole
  color_hex: string
  color_name: string
  phone: string | null
  email: string | null
  google_calendar_id: string | null
  can_drive: boolean
  availability_mode: 'strict' | 'flexible' | 'open'
  show_on_home_sidebar: boolean
  is_admin: boolean
  avatar_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MemberAvailabilityRule {
  id: string
  member_id: string
  day_of_week: number
  start_local: string
  end_local: string
  availability_type: 'unavailable' | 'available'
  reason: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface MemberAvailabilityException {
  id: string
  member_id: string
  start_at: string
  end_at: string
  override_type: 'day_off' | 'manual_block' | 'manual_available'
  note: string | null
  created_at: string
}

// ── Events ──────────────────────────────────────────────────

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  all_day: boolean
  event_type: 'event' | 'reminder'
  location_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_event_id: string | null
  google_calendar_id: string | null
  google_connection_id?: string | null
  source_member_id: string | null
  status: EventStatus
  is_enriched: boolean
  rrule: string | null
  recurrence_master_id: string | null
  record_kind?: 'single' | 'series_template' | 'occurrence'
  series_id?: string | null
  occurrence_key?: string | null
  original_start_time?: string | null
  original_start_date?: string | null
  is_exception?: boolean
  exception_paths?: string[]
  series_revision_applied?: number | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  // Trip leg fields (new leg-based model)
  trip_id: string | null
  leg_type: string | null
  flight_number: string | null
  confirmation_number: string | null
  // Provenance / Source type
  source_type?: 'routine' | 'google' | 'gmail' | 'casa'
  // Joined
  members?: EventMember[]
  enrichment?: EventEnrichment | null
}

export interface EventMember {
  id: string
  event_id: string
  family_member_id: string
  role: string
  rsvp_status: string
  family_member?: FamilyMember
}

export interface EventEnrichment {
  id: string
  event_id: string
  drive_time_mins: number | null
  departure_time: string | null
  route_summary: string | null
  weather_at_event: string | null
  weather_summary: string | null
  what_to_bring: string[]
  prep_notes: string | null
  outfit_suggestion: string | null
  parking_notes: string | null
  dietary_notes: string | null
  cost_estimate: string | null
  contact_name: string | null
  contact_phone: string | null
  meal_impact: string | null
  category: string | null
  category_locked: boolean
  confidence: 'high' | 'medium' | 'low'
  enriched_by: string | null
  enriched_at: string
  created_at: string
  updated_at: string
}

export interface EventLogistic {
  id: string
  event_id: string
  sort_order: number
  step_type: string
  icon: string | null
  title: string
  description: string | null
  time: string | null
  location_name: string | null
  address: string | null
  created_at: string
}

export interface EventChecklistItem {
  id: string
  event_id: string
  label: string
  note: string | null
  checked: boolean
  category: string | null
  sort_order: number
  created_at: string
}

export interface EventActionItem {
  id: string
  event_id: string
  title: string
  description: string | null
  due_date: string | null
  is_urgent: boolean
  completed: boolean
  completed_at: string | null
  assigned_to: string | null
  created_at: string
}

export interface Conflict {
  id: string
  event_a_id: string
  event_b_id: string | null
  conflict_type: string
  severity: number
  description: string
  resolved: boolean
  resolution: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  snoozed_until?: string | null
  snooze_count?: number
  last_snoozed_at?: string | null
  // Joined
  event_a?: { id: string; start_time: string; title: string } | null
  event_b?: { id: string; start_time: string; title: string } | null
}

export type SavedPlaceCategory =
  | 'restaurant'
  | 'friends_house'
  | 'school'
  | 'sports'
  | 'work'
  | 'medical'
  | 'travel'
  | 'errand'
  | 'home_service'
  | 'social'
  | 'other'

export interface SavedPlace {
  id: string
  name: string
  aliases: string[]
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  category: SavedPlaceCategory
  notes: string | null
  phone: string | null
  google_place_id: string | null
  confirmed: boolean
  source: 'manual' | 'derived'
  occurrence_count: number
  last_seen_at: string | null
  dismissed_at: string | null
  created_at: string
  updated_at: string
}

export interface SavedContact {
  id: string
  name: string
  aliases: string[]
  relationship: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  primary_place_id: string | null
  primary_place_source: 'manual' | 'derived' | null
  primary_place?: Pick<SavedPlace, 'id' | 'name' | 'address' | 'city' | 'state' | 'zip' | 'category'> | null
  confirmed: boolean
  source: 'manual' | 'derived'
  occurrence_count: number
  last_seen_at: string | null
  dismissed_at: string | null
  created_at: string
  updated_at: string
}

export interface ContactPlaceRelationship {
  id: string
  contact_id: string
  place_id: string
  relationship: string
  is_default: boolean
  source: 'manual' | 'derived'
  confirmed: boolean
  confidence: number
  evidence_count: number
  evidence_notes: string | null
  dismissed_at: string | null
  contact?: Pick<SavedContact, 'id' | 'name' | 'phone' | 'relationship'> | null
  place?: Pick<SavedPlace, 'id' | 'name' | 'address' | 'city' | 'state' | 'zip' | 'category'> | null
  created_at: string
  updated_at: string
}

export interface FamilyContactRelationship {
  id: string
  family_member_id: string
  contact_id: string
  relationship: string
  source: 'manual' | 'derived'
  confirmed: boolean
  confidence: number
  evidence_count: number
  evidence_notes: string | null
  dismissed_at: string | null
  family_member?: Pick<FamilyMember, 'id' | 'name'> | null
  contact?: Pick<SavedContact, 'id' | 'name' | 'phone' | 'relationship'> | null
  created_at: string
  updated_at: string
}

export interface PrepItem {
  id: string
  event_id: string | null
  type: string
  category?: PrepItemCategory | null
  emoji: string
  description: string
  event_title: string | null
  event_date: string | null
  due_by: string | null
  priority: number
  dismissed: boolean
  dismissed_at: string | null
  created_at: string
  source_type?: string | null
  source_ref?: string | null
  source_pattern_key?: string | null
  source_confidence?: number | null
  assigned_to?: string | null
  action_key?: string
  attention_thread_key?: string | null
  attention_vendor?: string | null
  attention_stage?: string | null
  snoozed_until?: string | null
  snooze_count?: number
  last_snoozed_at?: string | null
  is_user_labeled?: boolean | null
  cluster_id?: string | null
}

/**
 * Enforced 9-category taxonomy for prep items (replaces the free-text `type` field,
 * which had drifted to 17 different values with zero DB enforcement). Kept in sync with
 * the DB check constraint in supabase/migrations/20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql
 * and the analyze-prep LLM prompt. See src/utils/prepCategories.ts for display metadata.
 */
export type PrepItemCategory =
  | 'gift_occasion'
  | 'food_hosting'
  | 'forms_paperwork'
  | 'bills_payments'
  | 'travel_trips'
  | 'medical_health'
  | 'household_errands'
  | 'rsvp_response'
  | 'general_todo'


// ── Views ───────────────────────────────────────────────────

export type CalendarView = 'today' | 'week' | 'month' | 'agenda' | 'family-split' | 'stacked'
export type AppMode = 'interactive' | 'ambient'
export type ExperienceMode = 'living_canvas' | 'classic'
export type CanvasSubmode = 'calm' | 'turbo'

export interface AIMemoryObservation {
  id: string
  title: string
  details: string | null
  category: 'habit' | 'preference' | 'family_pattern' | 'operational'
  status: 'active' | 'review' | 'archived'
  source: 'assistant' | 'user' | 'system'
  confidence: number | null
  observed_at: string
  created_at: string
  updated_at: string
}

export interface AIBugReport {
  id: string
  title: string
  details: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'wont_fix'
  source: 'user' | 'assistant' | 'system'
  discovered_at: string
  created_at: string
  updated_at: string
  resolved_at: string | null
}

// ── Kitchen & Dinner Plan ──────────────────────────────────

export type DinnerMode = 'cook' | 'takeout' | 'leftovers' | 'dineout'

export interface DinnerPlan {
  [key: string]: unknown
  mode: DinnerMode
  title: string
  subtitle: string
  targetTime: string
  recipeId?: string
  chefOrDriver?: string
  statusBadge?: string
  isPast?: boolean
  notes?: string
}