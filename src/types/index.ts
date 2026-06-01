// ── Family ──────────────────────────────────────────────────

export type FamilyRole = 'parent' | 'child'

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
  is_admin: boolean
  avatar_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
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
  source_member_id: string | null
  status: EventStatus
  is_enriched: boolean
  rrule: string | null
  recurrence_master_id: string | null
  created_at: string
  updated_at: string
  // Trip leg fields (new leg-based model)
  trip_id: string | null
  leg_type: string | null
  flight_number: string | null
  confirmation_number: string | null
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
  distance_miles: number | null
  departure_time: string | null
  route_summary: string | null
  weather_at_event: string | null
  weather_summary: string | null
  weather_icon: string | null
  what_to_bring: string[]
  prep_notes: string | null
  outfit_suggestion: string | null
  parking_notes: string | null
  dietary_notes: string | null
  special_instructions: string | null
  cost_estimate: number | null
  contact_name: string | null
  contact_phone: string | null
  meal_impact: string | null
  category: string | null
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
  // Joined
  event_a?: { id: string; start_time: string; title: string } | null
}

export type SavedPlaceCategory = 'restaurant' | 'friends_house' | 'school' | 'sports' | 'work' | 'medical' | 'other'

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
  google_place_id: string | null
  created_at: string
  updated_at: string
}

export interface PrepItem {
  id: string
  event_id: string
  type: string
  emoji: string
  description: string
  event_title: string | null
  event_date: string | null
  due_by: string | null
  priority: number
  dismissed: boolean
  dismissed_at: string | null
  created_at: string
}

// ── Views ───────────────────────────────────────────────────

export type CalendarView = 'today' | 'week' | 'month' | 'agenda' | 'family-split' | 'stacked'
export type AppMode = 'interactive' | 'ambient'