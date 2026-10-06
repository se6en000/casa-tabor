// The Family Wall's view of a day: who is where, who is on the road, and who
// drives whom. Built by buildDayPlan() from calendar events, family routines
// and family members. Maps to the design's Score (lanes), Next Move, and
// "Needs a decision" (gaps / shared destinations).
import type { TravelTrip } from './travel'

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
  /** The wall colour they picked (0–5); else theirs follows the family's order. */
  pigment?: number | null
  /** How they travel (canvas 19): time at the airport, off the plane, and the usual way there. */
  travel_prefs?: { airport_minutes?: number | null; deplane_minutes?: number | null; way?: 'uber' | 'someone' | 'drive_park' | null } | null
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
  /** A reminder with no due date is a to-do for any time (its start_time is only a placeholder). */
  has_due_date?: boolean | null
  status?: string | null
  /** A trip's leg, as the travel email importer files it (flight_outbound / flight_return / hotel / car_rental). */
  leg_type?: string | null
  trip_id?: string | null
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
  /** The usual driver is away on a trip (travel.ts), so this run needs someone: who, and where they are. */
  usualDriverAway?: { memberId: string; city: string }
  /** The ride to or from the airport on a trip away (travel.ts). */
  travel?: {
    direction: 'out' | 'home'
    way: 'uber' | 'someone' | 'drive_park'
    city: string
    /** A flight, or a trip by car (the "flight" is then the drive). */
    mode: 'fly' | 'drive'
    flight: { number: string | null; from: string; to: string; departAt: Date; landAt: Date }
  }
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
  /** From a routine (school, work, a class): what "Hide routines" tidies away. */
  fromRoutine?: boolean
  /** Work hours: their own drives at the edges come off it (Kelly drops Liv at Bak on the way in). */
  work?: boolean
  /** Part of a trip away (canvas 19): the ride, the wait at the airport, the flight, or the time away. */
  travel?: 'drive' | 'wait' | 'flight' | 'away'
  /** A household chore (chores.ts): a small mark at its time. */
  chore?: boolean
  /** A reminder, not an appointment (it's a to-do; the header leaves it to NEXT UP). */
  reminder?: boolean
}

/** Something the family should fix or decide; feeds "Needs a decision". */
export interface DayGap {
  kind: 'no_driver' | 'no_person'
  sourceId: string
  title: string
  at: Date
  /** The usual driver is away on a trip (travel.ts): who, and where. */
  away?: { memberId: string; city: string }
}

/** A chore on this day: who usually does it, who has it today, and why it's open if it is. */
export interface DayChore {
  /** What a hand-off is saved against (`chore:<id>`). */
  key: string
  choreId: string
  title: string
  at: Date
  doerId: string | null
  usualDoerId: string | null
  forMemberId: string | null
  /** The usual doer is away on a trip then. */
  usualAway?: { memberId: string; city: string }
}

/** Someone's trip away, as it stands on this day (travel.ts). */
export interface DayTravel {
  memberId: string
  tripId: string
  city: string
  phase: 'leaving' | 'away' | 'returning' | 'day'
  mode: 'fly' | 'drive'
  /** "day 1 of 2" */
  dayIndex: number
  dayCount: number
  leaveHomeAt: Date | null
  homeAt: Date | null
  /** The whole trip (the trip sheet opens it). */
  trip: TravelTrip
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
  /** Timed items with nobody on them — the "No one yet" row (board 08a), so nothing goes missing. */
  /** `reminder`: a to-do (it keeps its tick wherever it's listed). */
  nobody: Array<{ sourceId: string; title: string; start: Date; end: Date; reminder?: boolean }>
  /** All-day items (birthdays, spirit days) shown as notes, not lane blocks; a trip away is one too, with its day count. */
  allDay: Array<{ sourceId: string; title: string; memberIds: string[]; trip?: { city: string; dayIndex: number; dayCount: number; mode?: 'fly' | 'drive' } }>
  /** Who is away on a trip this day (travel.ts). */
  travel: DayTravel[]
  /** The day's household chores (chores.ts), and who has each. */
  chores: DayChore[]
  /** Every parent is away that night (trips): who's home with the kids (a hand-off saved as `night`). */
  overnight: { key: 'night'; whoId: string | null; awayIds: string[] } | null
  gaps: DayGap[]
  sharedDestinations: SharedDestination[]
}
