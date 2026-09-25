// Per-day trip decisions made from the wall: "Hand off" for runs that have no
// event row of their own (school runs come from routines), and "Leaving now".
// Stored as one settings value, keyed by local date; a week is kept.

export const TRIP_STATE_SETTINGS_KEY = 'wall_trip_state'
const KEEP_DAYS = 7

export interface DayTripState {
  /** trip id → who drives today instead (null = nobody). */
  drivers: Record<string, string | null>
  /** trip id → when "Leaving now" was tapped (ISO). */
  departed: Record<string, string>
  /** decision key → answered "keep it as it is" (Keep two trips, will manage). */
  dismissed: Record<string, true>
}

export type WallTripState = Record<string, Partial<DayTripState>>

export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dayState(state: WallTripState | null | undefined, date: Date): DayTripState {
  const day = state?.[dayKey(date)]
  return { drivers: { ...(day?.drivers ?? {}) }, departed: { ...(day?.departed ?? {}) }, dismissed: { ...(day?.dismissed ?? {}) } }
}

function update(state: WallTripState, date: Date, change: (day: DayTripState) => DayTripState): WallTripState {
  const cutoff = new Date(date)
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS)
  const kept = Object.fromEntries(Object.entries(state).filter(([key]) => key >= dayKey(cutoff)))
  return { ...kept, [dayKey(date)]: change(dayState(state, date)) }
}

export const withHandOff = (state: WallTripState, date: Date, tripId: string, driverId: string | null): WallTripState =>
  update(state, date, (day) => ({ ...day, drivers: { ...day.drivers, [tripId]: driverId } }))

export const withDeparted = (state: WallTripState, date: Date, tripIds: string[], at: Date): WallTripState =>
  update(state, date, (day) => ({ ...day, departed: { ...day.departed, ...Object.fromEntries(tripIds.map((id) => [id, at.toISOString()])) } }))

export const withoutDeparted = (state: WallTripState, date: Date, tripIds: string[]): WallTripState =>
  update(state, date, (day) => ({ ...day, departed: Object.fromEntries(Object.entries(day.departed).filter(([id]) => !tripIds.includes(id))) }))

export const withDismissed = (state: WallTripState, date: Date, decisionKey: string): WallTripState =>
  update(state, date, (day) => ({ ...day, dismissed: { ...day.dismissed, [decisionKey]: true } }))
