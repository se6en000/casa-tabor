import { MAIN_ROUTINE_KEY, WORK_HOURS_KEY, formatDisplayVenueName, type DayScheduleOverride, type FamilyRoutine } from '../lib/familyRoutines.ts'

// Routines on the person's page and in the editor (canvas row 16): the plain-words lines, and the edits the
// editor makes. Pure, so it's tested without rendering; saving is saveRoutine.ts.

export type RoutineKind = 'school' | 'work' | 'camp' | 'class' | 'other'

/** "+ Add a routine" asks which kind. */
export const ROUTINE_KINDS: Array<{ kind: RoutineKind; label: string }> = [
  { kind: 'school', label: 'School' },
  { kind: 'work', label: 'Work' },
  { kind: 'camp', label: 'Camp' },
  { kind: 'class', label: 'A class or practice' },
  { kind: 'other', label: 'Something else' },
]

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
/** The week as the editor shows it, Monday first. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0]
export const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const same = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d))

/** "Weekdays", "Every day", "Weekends", else "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  if (same(days, [1, 2, 3, 4, 5])) return 'Weekdays'
  if (same(days, [0, 1, 2, 3, 4, 5, 6])) return 'Every day'
  if (same(days, [0, 6])) return 'Weekends'
  if (days.length === 0) return 'No days'
  return WEEK.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ')
}

/** "07:35" → "7:35", "13:00" → "1:00"; with the half of the day when asked ("1:00 PM"). */
export function clock(local: string, withHalf = false): string {
  const [h, m] = local.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}${withHalf ? (h < 12 ? ' AM' : ' PM') : ''}`
}

/** What kind it is, as the page says it. */
export function routineKind(routine: FamilyRoutine): RoutineKind {
  if (routine.routineType === 'school' || routine.routineType === 'work' || routine.routineType === 'camp') return routine.routineType
  return /class|practice|lesson/i.test(routine.title) ? 'class' : 'other'
}

const venue = (routine: FamilyRoutine) => formatDisplayVenueName(routine.venueName, routine.shortVenueName)

/** "School · Palm Beach Public", "Work", "Piano · Mrs. Lee's". */
export function routineHeadline(routine: FamilyRoutine): string {
  const kind = routineKind(routine)
  const name = kind === 'school' ? 'School' : kind === 'work' ? 'Work' : kind === 'camp' ? 'Camp' : routine.title || 'Routine'
  const where = venue(routine)
  return where && where !== name ? `${name} · ${where}` : name
}

/** "Jake drops off, Giselle picks up"; one person doing both: "Jake drives"; nobody: "". */
export function driversLine(dropoff: string | null | undefined, pickup: string | null | undefined): string {
  const d = dropoff?.trim()
  const p = pickup?.trim()
  if (d && p && d === p) return `${d} drives`
  return [d && `${d} drops off`, p && `${p} picks up`].filter(Boolean).join(', ')
}

/** "Weekdays 7:35–2:00 · Jake drops off, Giselle picks up". */
export function routineDetail(routine: FamilyRoutine): string {
  const hours = `${daysLabel(routine.daysOfWeek)} ${clock(routine.startLocal)}–${clock(routine.endLocal)}`
  const drivers = routineKind(routine) === 'work' ? '' : driversLine(routine.dropoffDriverName, routine.pickupDriverName)
  return drivers ? `${hours} · ${drivers}` : hours
}

/** "Wednesdays: out at 1:00", "Tuesdays: in at 7:00 (Early Beethoven Strings)", "Fridays: Kelly picks up". */
export function overrideLine(routine: FamilyRoutine, o: DayScheduleOverride): string {
  const parts: string[] = []
  const start = o.startLocal && o.startLocal !== routine.startLocal ? o.startLocal : null
  const end = o.endLocal && o.endLocal !== routine.endLocal ? o.endLocal : null
  if (start && end) parts.push(`${clock(start)}–${clock(end)}`)
  else if (start) parts.push(`in at ${clock(start)}`)
  else if (end) parts.push(`out at ${clock(end)}`)
  const drop = o.dropoffDriverName && o.dropoffDriverName !== routine.dropoffDriverName ? o.dropoffDriverName : null
  const pick = o.pickupDriverName && o.pickupDriverName !== routine.pickupDriverName ? o.pickupDriverName : null
  const drivers = driversLine(drop, pick)
  if (drivers) parts.push(drivers)
  const what = parts.join(' · ') || 'as usual'
  return `${DAY_PLURAL[o.dayOfWeek]}: ${what}${o.label ? ` (${o.label})` : ''}`
}

/** The days that differ, as lines (only ones that change something). */
export function overrideLines(routine: FamilyRoutine): string[] {
  return (routine.dayOverrides ?? [])
    .filter((o) => o.enabled !== false && routine.daysOfWeek.includes(o.dayOfWeek))
    .sort((a, b) => WEEK.indexOf(a.dayOfWeek) - WEEK.indexOf(b.dayOfWeek))
    .map((o) => overrideLine(routine, o))
    .filter((line) => !line.endsWith(': as usual'))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-08-10" → "Aug 10, 2026". */
export function dayText(ymd: string, withYear = true): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
}

/** "Aug 10, 2026 – May 28, 2027", "From Aug 10, 2026", "All year". */
export function yearLine(routine: FamilyRoutine): string {
  if (routine.startDate && routine.endDate) return `${dayText(routine.startDate)} – ${dayText(routine.endDate)}`
  if (routine.startDate) return `From ${dayText(routine.startDate)}`
  if (routine.endDate) return `Until ${dayText(routine.endDate)}`
  return 'All year'
}

/** A new routine of that kind for the person; the first one they have is their main. */
export function newRoutine(kind: RoutineKind, memberId: string, existing: FamilyRoutine[], now = Date.now()): FamilyRoutine {
  const keys = new Set(existing.map((r) => r.key ?? MAIN_ROUTINE_KEY))
  const key = kind === 'work' ? WORK_HOURS_KEY : keys.size === 0 ? MAIN_ROUTINE_KEY : `${kind}-${now.toString(36)}`
  const base: FamilyRoutine = {
    key, memberId, title: 'Routine', routineType: 'custom', venueName: '', shortVenueName: null, venueAddress: '',
    daysOfWeek: [1, 2, 3, 4, 5], startLocal: '08:00', endLocal: '15:00', dayOverrides: [], startDate: null, endDate: null,
    dropoffDriverName: '', dropoffDriverId: null, pickupDriverName: '', pickupDriverId: null,
    syncMode: 'exceptions_only', syncToGoogle: true, enabled: true,
  }
  switch (kind) {
    case 'school': return { ...base, title: 'School', routineType: 'school', startLocal: '08:00', endLocal: '15:00' }
    case 'work': return { ...base, title: 'Work', routineType: 'work', startLocal: '09:00', endLocal: '17:00', syncMode: 'none', syncToGoogle: false }
    case 'camp': return { ...base, title: 'Camp', routineType: 'camp', startLocal: '09:00', endLocal: '15:00' }
    case 'class': return { ...base, title: 'Class', daysOfWeek: [1], startLocal: '16:00', endLocal: '17:00' }
    case 'other': return { ...base, daysOfWeek: [1], startLocal: '16:00', endLocal: '17:00' }
  }
}

// ── Edits ──────────────────────────────────────────────────────────────

export function toggleDay(routine: FamilyRoutine, day: number): FamilyRoutine {
  const on = routine.daysOfWeek.includes(day)
  return { ...routine, daysOfWeek: on ? routine.daysOfWeek.filter((d) => d !== day) : [...routine.daysOfWeek, day].sort() }
}

const toMinutes = (local: string) => { const [h, m] = local.split(':').map(Number); return h * 60 + m }
const toLocal = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Moves a time by some minutes, kept within the day and never past the other end. */
export function stepTime(local: string, delta: number, bounds: { min?: string; max?: string } = {}): string {
  const lo = bounds.min ? toMinutes(bounds.min) + 5 : 0
  const hi = bounds.max ? toMinutes(bounds.max) - 5 : 23 * 60 + 55
  return toLocal(Math.min(hi, Math.max(lo, toMinutes(local) + delta)))
}

export function stepHours(routine: FamilyRoutine, which: 'start' | 'end', delta: number): FamilyRoutine {
  return which === 'start'
    ? { ...routine, startLocal: stepTime(routine.startLocal, delta, { max: routine.endLocal }) }
    : { ...routine, endLocal: stepTime(routine.endLocal, delta, { min: routine.startLocal }) }
}

export interface DriverChoice { id: string | null; name: string }

export function setDriver(routine: FamilyRoutine, which: 'dropoff' | 'pickup', driver: DriverChoice | null): FamilyRoutine {
  return which === 'dropoff'
    ? { ...routine, dropoffDriverName: driver?.name ?? '', dropoffDriverId: driver?.id ?? null }
    : { ...routine, pickupDriverName: driver?.name ?? '', pickupDriverId: driver?.id ?? null }
}

export function setPlace(routine: FamilyRoutine, place: { name: string; address: string }): FamilyRoutine {
  return { ...routine, venueName: place.name.trim(), venueAddress: place.address.trim(), shortVenueName: null }
}

export function setYear(routine: FamilyRoutine, startDate: string | null, endDate: string | null): FamilyRoutine {
  return { ...routine, startDate, endDate }
}

/** The day's override as the editor works on it: the routine's own hours and drivers when it has none. */
export function overrideFor(routine: FamilyRoutine, day: number): DayScheduleOverride {
  return routine.dayOverrides?.find((o) => o.dayOfWeek === day) ?? {
    dayOfWeek: day, startLocal: routine.startLocal, endLocal: routine.endLocal,
    dropoffDriverName: routine.dropoffDriverName, dropoffDriverId: routine.dropoffDriverId ?? null,
    pickupDriverName: routine.pickupDriverName, pickupDriverId: routine.pickupDriverId ?? null, enabled: true,
  }
}

export function putOverride(routine: FamilyRoutine, o: DayScheduleOverride): FamilyRoutine {
  const rest = (routine.dayOverrides ?? []).filter((x) => x.dayOfWeek !== o.dayOfWeek)
  return { ...routine, dayOverrides: [...rest, { ...o, enabled: true }] }
}

export function removeOverride(routine: FamilyRoutine, day: number): FamilyRoutine {
  return { ...routine, dayOverrides: (routine.dayOverrides ?? []).filter((x) => x.dayOfWeek !== day) }
}

/** What's missing before it can be saved, in plain words; null when it's ready. */
export function cannotSave(routine: FamilyRoutine): string | null {
  if (routine.daysOfWeek.length === 0) return 'Pick at least one day.'
  if (toMinutes(routine.endLocal) <= toMinutes(routine.startLocal)) return 'It has to end after it starts.'
  const kind = routineKind(routine)
  if ((kind === 'school' || kind === 'camp') && !routine.venueName.trim()) return 'Where is it?'
  if ((kind === 'class' || kind === 'other') && !routine.title.trim()) return 'What is it called?'
  if (routine.startDate && routine.endDate && routine.endDate < routine.startDate) return 'The year has to end after it starts.'
  return null
}

/** Days off coming up for the person, from today, as "Oct 12 · Nov 11 · Nov 23–27". */
export function daysOffLine(dayOffs: Array<{ start: string; end: string }>, max = 3): string {
  if (dayOffs.length === 0) return 'None coming up'
  const spans = dayOffs.slice(0, max).map(({ start, end }) => {
    if (start === end) return dayText(start, false)
    const [, sm] = start.split('-').map(Number)
    const [, em, ed] = end.split('-').map(Number)
    return sm === em ? `${dayText(start, false)}–${ed}` : `${dayText(start, false)} – ${dayText(end, false)}`
  })
  const more = dayOffs.length - max
  return `${spans.join(' · ')}${more > 0 ? ` · ${more} more` : ''}`
}
