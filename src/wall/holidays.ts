import type { FamilyRoutine } from '../lib/familyRoutines'
import type { DayOff } from './engine/dayPlan'
import type { WallMember } from './engine/types'

// School days off for US holidays, asked as one of Alexa's questions (Jake, Oct 7: "if there is a US holiday can there
// be a suggestion to mark that holiday or school vacation on the kids routine … and also suggest, hey do you need to
// figure out whos taking care of Owen that day?" → "can you just make the holidays as part of the 'alexa has a question
// for you?'"). About ten days ahead, for a holiday on a weekday someone has school: "Are they off?" — then, once
// they are, "Who has them?". Pure; WallView adds these to the week's decisions and Alexa's topic.

export const HOLIDAY_HORIZON_DAYS = 10

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const nth = (year: number, month: number, weekday: number, n: number) => {
  const first = new Date(year, month, 1)
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7)
}
const last = (year: number, month: number, weekday: number) => {
  const end = new Date(year, month + 1, 0)
  return new Date(year, month, end.getDate() - ((end.getDay() - weekday + 7) % 7))
}
/** A fixed-date holiday on a weekend is kept on the Friday before or the Monday after. */
const observed = (d: Date) => (d.getDay() === 6 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) : d.getDay() === 0 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) : d)

/** The US federal holidays of a year (observed dates), plus the day after Thanksgiving, which schools take too. */
export function usHolidays(year: number): Array<{ ymd: string; name: string }> {
  const thanksgiving = nth(year, 10, 4, 4)
  return [
    ['New Year’s Day', observed(new Date(year, 0, 1))],
    ['Martin Luther King Jr. Day', nth(year, 0, 1, 3)],
    ['Presidents’ Day', nth(year, 1, 1, 3)],
    ['Memorial Day', last(year, 4, 1)],
    ['Juneteenth', observed(new Date(year, 5, 19))],
    ['Independence Day', observed(new Date(year, 6, 4))],
    ['Labor Day', nth(year, 8, 1, 1)],
    ['Columbus Day', nth(year, 9, 1, 2)],
    ['Veterans Day', observed(new Date(year, 10, 11))],
    ['Thanksgiving', thanksgiving],
    ['the day after Thanksgiving', new Date(year, 10, thanksgiving.getDate() + 1)],
    ['Christmas Day', observed(new Date(year, 11, 25))],
  ].map(([name, d]) => ({ name: name as string, ymd: ymdOf(d as Date) }))
}

export type HolidayAction =
  | { type: 'days_off'; ymd: string; memberIds: string[]; holiday: string }
  | { type: 'cover'; ymd: string; memberIds: string[]; holiday: string; name: string }

export interface HolidayQuestion {
  key: string
  kind: 'holiday_off' | 'holiday_cover'
  date: Date
  at: Date
  text: string
  holiday: string
  memberIds: string[]
  answers: Array<{ label: string; action: HolidayAction | { type: 'dismiss' } }>
}

const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const offOn = (memberId: string, ymd: string, dayOffs: DayOff[]) => dayOffs.find((d) => d.member_id === memberId && d.override_type === 'day_off' && ymdOf(new Date(d.start_at)) <= ymd && ymd <= ymdOf(new Date(d.end_at)))

/**
 * The holiday questions due now: "Columbus Day is Monday — are Liv, Emme and Owen off school?" for a holiday in the
 * next ten days on a weekday someone has school and nobody's marked off; then, for those off with nobody named,
 * "Owen and Emme are home Monday — who has them?" (the person who usually has them first, then whoever else cares
 * for the kids). Answered or dismissed ones don't come back.
 */
export function holidayQuestions({ now, routines, dayOffs, members, dismissed = new Set<string>() }: { now: Date; routines: FamilyRoutine[]; dayOffs: DayOff[]; members: WallMember[]; dismissed?: ReadonlySet<string> }): HolidayQuestion[] {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + HOLIDAY_HORIZON_DAYS)
  const found: HolidayQuestion[] = []
  for (const { ymd, name } of [...usHolidays(today.getFullYear()), ...usHolidays(today.getFullYear() + 1)]) {
    const [y, m, d] = ymd.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    if (!(date > today && date <= until)) continue
    const weekday = date.getDay()
    const school = routines.filter((r) => r.enabled !== false && (r.routineType ?? 'school') === 'school' && r.daysOfWeek.includes(weekday)
      && (!r.startDate || r.startDate <= ymd) && (!r.endDate || ymd <= r.endDate))
    const kids = [...new Set(school.map((r) => r.memberId))].filter((id) => members.some((m) => m.id === id))
    if (kids.length === 0) continue
    const when = date.toLocaleDateString('en-US', { weekday: 'long' })
    const at = new Date(y, m - 1, d, 7, 0)
    const notOff = kids.filter((id) => !offOn(id, ymd, dayOffs))
    if (notOff.length === kids.length) {
      const key = `holiday-off:${ymd}`
      if (dismissed.has(key)) continue
      found.push({
        key, kind: 'holiday_off', date, at, holiday: name, memberIds: kids,
        text: `${name} is ${when} — ${kids.length === 1 ? 'is' : 'are'} ${joinNames(kids.map(nameOf))} off school?`,
        answers: [
          { label: kids.length === 1 ? 'Off that day' : 'They’re off', action: { type: 'days_off', ymd, memberIds: kids, holiday: name } },
          { label: 'School’s open', action: { type: 'dismiss' } },
        ],
      })
      continue
    }
    // Off, and nobody named for them yet: who has them? (Only the ones someone usually has — a carer, or a pickup.)
    const home = kids.filter((id) => { const off = offOn(id, ymd, dayOffs); return off && !/ has (him|her|them)| with /i.test(String((off as DayOff & { note?: string | null }).note ?? '')) })
    if (home.length === 0) continue
    const key = `holiday-cover:${ymd}`
    if (dismissed.has(key)) continue
    const usual = [...new Set(routines.filter((r) => home.includes(r.memberId) && (r.routineType === 'care' || r.routineType === 'school'))
      .map((r) => (r.routineType === 'care' ? r.pickupDriverName || r.dropoffDriverName : r.pickupDriverName)).filter(Boolean))]
    const carers = [...usual, ...members.filter((m) => m.role === 'caregiver').map((m) => m.name)].filter((n, i, all) => n && all.indexOf(n) === i)
    found.push({
      key, kind: 'holiday_cover', date, at, holiday: name, memberIds: home,
      text: `${joinNames(home.map(nameOf))} ${home.length === 1 ? 'is' : 'are'} home ${when} for ${name} — who has ${home.length === 1 ? nameOf(home[0]) : 'them'}?`,
      answers: [
        ...carers.slice(0, 1).map((n) => ({ label: `${n} has ${home.length === 1 ? nameOf(home[0]) : 'them'}`, action: { type: 'cover' as const, ymd, memberIds: home, holiday: name, name: n } })),
        { label: 'We’ve got it', action: { type: 'dismiss' } },
      ],
    })
  }
  return found
}

/** As the week's decisions (WallView, PhoneFrame): each answered or waved off on the holiday's own day. */
export function holidayDecisions({ now, routines, dayOffs, members, dismissedOn }: { now: Date; routines: FamilyRoutine[]; dayOffs: DayOff[]; members: WallMember[]; dismissedOn?: (date: Date) => Record<string, unknown> | undefined }) {
  const dismissed = new Set<string>()
  for (let i = 0; i <= HOLIDAY_HORIZON_DAYS; i++) {
    for (const key of Object.keys(dismissedOn?.(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)) ?? {})) dismissed.add(key)
  }
  return holidayQuestions({ now, routines, dayOffs, members, dismissed })
    .map((q) => ({ key: q.key, kind: q.kind, at: q.at, text: q.text, tripIds: [] as string[], sourceIds: [] as string[], answers: q.answers, date: q.date }))
}
