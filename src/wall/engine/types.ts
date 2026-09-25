// The Family Wall's view of a day: who is where, who is on the road, and who
// drives whom. Built by buildDayPlan() from calendar events, family routines
// and family members. Maps to the design's Score (lanes), Next Move, and
// "Needs a decision" (gaps / shared destinations).

/** Whether an item happens at home, somewhere else, or nobody recorded a place. */
export type PlaceStatus = 'home' | 'away' | 'unknown'

export interface WallMember {
  id: string
  name: string
  full_name?: string | null
  /** 'parent' | 'child' | 'caregiver' */
  role: string
  can_drive: boolean
  show_on_home_sidebar?: boolean | null
  sort_order?: number | null
}

/** A leg from a saved transportation plan (event_plan_overrides.transportation_plan). */
export interface WallPlanLeg {
  purpose: string
  timing: string
  /** "HH:mm" local, or an ISO timestamp */
  time: string
  driverId: string | null
  driverName: string
  destination?: { name?: string; address?: string } | null
}

/** The fields of a calendar event the engine reads (a subset of EventWithDetails). */
export interface WallEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  all_day: boolean
  event_type?: string | null
  status?: string | null
  location_name: string | null
  address: string | null
  members?: Array<{ family_member_id?: string | null; family_member?: { id: string } | null; role?: string | null }> | null
  enrichment?: { drive_time_mins: number | null; departure_time: string | null; weather_at_event?: string | null } | null
  plan_override?: {
    transportation_plan?: { legs?: WallPlanLeg[] | null } | null
    mode_override?: string | null
  } | null
}

export type TripKind = 'dropoff' | 'pickup' | 'outing'

/** A movement: someone leaves, goes somewhere, and (usually) comes back. */
export interface Trip {
  id: string
  kind: TripKind
  /** Calendar event id, or routine id for school runs. */
  sourceId: string
  source: 'event' | 'routine'
  title: string
  /** Who travels (for a drop-off/pickup: the children). */
  travelerIds: string[]
  /** Who drives. null = nobody assigned (never guessed). */
  driverId: string | null
  /** Where the driver came from: saved plan, routine, event member role, or the traveler driving themself. */
  driverSource: 'plan' | 'routine' | 'event_member' | 'self' | 'handoff' | null
  destination: { name: string; address: string | null }
  /** When to leave home. null when the drive time is unknown. */
  leaveAt: Date | null
  /** When the travelers must arrive (drop-off time, pickup time, event start). */
  arriveAt: Date
  /** When the driver is back home, when known. */
  homeAt: Date | null
  driveMinutes: number | null
  /** Forecast at the destination, as stored with the event (e.g. "Overcast, 86°F, 40% rain chance"). */
  weather?: string | null
  /** When "Leaving now" was tapped on the wall; null otherwise. */
  departedAt?: Date | null
  /** A pickup that goes straight on to another trip's place: that trip's id, the place, and any lateness there. */
  continuesTo?: string
  onward?: { place: string; lateBy: number }
  /** A trip that starts where a pickup left off (not from home): the pickup's id. */
  chainedFrom?: string
  /** Minutes after the start the travelers get there, when a chain makes them late (estimated). */
  arrivesLateBy?: number
}

export type SegmentKind = 'at_place' | 'activity' | 'drive'

/** One block in a person's lane on the Score. */
export interface LaneSegment {
  kind: SegmentKind
  start: Date
  end: Date
  label: string
  placeStatus: PlaceStatus
  sourceId: string
  /** For drive segments: the trip, and who is driving (for the hatch color). */
  tripId?: string
  driverId?: string | null
}

/** Something the family should fix or decide; feeds "Needs a decision". */
export interface DayGap {
  kind: 'no_driver' | 'no_person'
  sourceId: string
  title: string
  at: Date
}

/** Separate trips that go to the same place at about the same time (one car could do both). */
export interface SharedDestination {
  tripIds: string[]
  destination: string
  arriveAt: Date
}

export interface DayPlan {
  date: Date
  /** memberId -> that person's segments, in time order */
  lanes: Map<string, LaneSegment[]>
  trips: Trip[]
  /** Everyone with a segment or a trip role today (drives sitter lanes). */
  activeMemberIds: Set<string>
  /** Timed items with no place recorded, e.g. a pickup reminder with no address. */
  unplaced: Array<{ sourceId: string; title: string; at: Date; memberIds: string[] }>
  /** All-day items (birthdays, spirit days) shown as notes, not lane blocks. */
  allDay: Array<{ sourceId: string; title: string; memberIds: string[] }>
  gaps: DayGap[]
  sharedDestinations: SharedDestination[]
}
