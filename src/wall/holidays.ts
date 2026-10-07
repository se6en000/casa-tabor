import type { FamilyRoutine } from '../lib/familyRoutines'
import type { DayOff } from './engine/dayPlan'
import type { WallMember } from './engine/types'
import { SCHOOL_CALENDAR_UNTIL, federalHolidays, rangeWords, schoolDaysOff, weekdaysBetween } from '../../supabase/functions/_shared/school-calendar.mjs'

// School days off for US holidays, asked as one of Alexa's questions (Jake, Oct 7: "if there is a US holiday can there
// be a suggestion to mark that holiday or school vacation on the kids routine … and also suggest, hey do you need to
// figure out whos taking care of Owen that day?" → "can you just make the holidays as part of the 'alexa has a question
// for you?'"). About ten days ahead, for a holiday on a weekday someone has school: "Are they off?" — then, once
// they are, "Who has them?". Pure; WallView adds these to the week's decisions and Alexa's topic.

export const HOLIDAY_HORIZON_DAYS = 10

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** The US federal holidays of a year (observed dates), plus the day after Thanksgiving (school-calendar.mjs). */
export const usHolidays = (year: number) => federalHolidays(year)

export type HolidayAction =
  | { type: 'days_off'; ymd: string; until?: string; memberIds: string[]; holiday: string }
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

/** A long break (a week or more) is asked about three weeks ahead — a trip, camp, or who has the kids. */
export const BREAK_HORIZON_DAYS = 21

const joinNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const offOn = (memberId: string, ymd: string, dayOffs: DayOff[]) => dayOffs.find((d) => d.member_id === memberId && d.override_type === 'day_off' && ymdOf(new Date(d.start_at)) <= ymd && ymd <= ymdOf(new Date(d.end_at)))
const dateOf = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d) }

/** The days off ahead: the school calendar's while it lasts, then the federal holidays (single days). */
export function daysOffAhead(fromYmd: string, toYmd: string): Array<{ from: string; to: string; name: string }> {
  const school = schoolDaysOff(fromYmd, toYmd < SCHOOL_CALENDAR_UNTIL ? toYmd : SCHOOL_CALENDAR_UNTIL)
  const years = [Number(fromYmd.slice(0, 4)), Number(toYmd.slice(0, 4))]
  const federal = [...new Set(years)].flatMap(usHolidays)
    .filter((h) => h.ymd > SCHOOL_CALENDAR_UNTIL && h.ymd >= fromYmd && h.ymd <= toYmd)
    .map((h) => ({ from: h.ymd, to: h.ymd, name: h.name }))
  return [...school, ...federal].sort((a, b) => a.from.localeCompare(b.from))
}

/**
 * The questions due now: "Columbus Day is Monday — are Liv, Emme and Owen off school?" ten days before a day off on a
 * school day, "Winter break is Mon Dec 21 – Fri Jan 1 — are Liv, Emme and Owen off?" three weeks before a long one;
 * then, for those off with nobody named, "… who has them?" (the person who usually has them first). Answered or
 * waved off ones don't come back.
 */
export function holidayQuestions({ now, routines, dayOffs, members, dismissed = new Set<string>() }: { now: Date; routines: FamilyRoutine[]; dayOffs: DayOff[]; members: WallMember[]; dismissed?: ReadonlySet<string> }): HolidayQuestion[] {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ymd = (d: Date) => ymdOf(d)
  const tomorrow = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
  const far = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + BREAK_HORIZON_DAYS))
  const near = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + HOLIDAY_HORIZON_DAYS))
  const found: HolidayQuestion[] = []
  for (const off of daysOffAhead(tomorrow, far)) {
    if (off.from < tomorrow) continue
    const long = weekdaysBetween(off.from, off.to) >= 5
    if (!long && off.from > near) continue
    // Who has school on one of those days.
    const weekdays = new Set<number>()
    for (let t = dateOf(off.from); ymd(t) <= off.to; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) weekdays.add(t.getDay())
    const school = routines.filter((r) => r.enabled !== false && (r.routineType ?? 'school') === 'school' && r.daysOfWeek.some((d) => weekdays.has(d))
      && (!r.startDate || r.startDate <= off.to) && (!r.endDate || off.from <= r.endDate))
    const kids = [...new Set(school.map((r) => r.memberId))].filter((id) => members.some((m) => m.id === id))
    if (kids.length === 0) continue
    const date = dateOf(off.from)
    const when = off.from === off.to ? date.toLocaleDateString('en-US', { weekday: 'long' }) : rangeWords(off.from, off.to)
    const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0)
    const notOff = kids.filter((id) => !offOn(id, off.from, dayOffs))
    if (notOff.length === kids.length) {
      const key = `holiday-off:${off.from}`
      if (dismissed.has(key)) continue
      found.push({
        key, kind: 'holiday_off', date, at, holiday: off.name, memberIds: kids,
        text: `${off.name} is ${when} — ${kids.length === 1 ? 'is' : 'are'} ${joinNames(kids.map(nameOf))} off${long ? '' : ' school'}?`,
        answers: [
          { label: kids.length === 1 ? 'Off then' : 'They’re off', action: { type: 'days_off', ymd: off.from, ...(off.to !== off.from ? { until: off.to } : {}), memberIds: kids, holiday: off.name } },
          { label: 'School’s open', action: { type: 'dismiss' } },
        ],
      })
      continue
    }
    // Off, and nobody named for them yet: who has them?
    const home = kids.filter((id) => { const o = offOn(id, off.from, dayOffs); return o && !/ has (him|her|them)| with /i.test(String((o as DayOff & { note?: string | null }).note ?? '')) })
    if (home.length === 0) continue
    const key = `holiday-cover:${off.from}`
    if (dismissed.has(key)) continue
    const usual = [...new Set(routines.filter((r) => home.includes(r.memberId) && (r.routineType === 'care' || r.routineType === 'school'))
      .map((r) => (r.routineType === 'care' ? r.pickupDriverName || r.dropoffDriverName : r.pickupDriverName)).filter(Boolean))]
    const carers = [...usual, ...members.filter((m) => m.role === 'caregiver').map((m) => m.name)].filter((n, i, all) => n && all.indexOf(n) === i)
    const them = home.length === 1 ? nameOf(home[0]) : 'them'
    found.push({
      key, kind: 'holiday_cover', date, at, holiday: off.name, memberIds: home,
      text: long
        ? `${joinNames(home.map(nameOf))} ${home.length === 1 ? 'is' : 'are'} off ${when} for ${off.name} — who has ${them}?`
        : `${joinNames(home.map(nameOf))} ${home.length === 1 ? 'is' : 'are'} home ${when} for ${off.name} — who has ${them}?`,
      answers: [
        ...carers.slice(0, 1).map((n) => ({ label: `${n} has ${them}`, action: { type: 'cover' as const, ymd: off.from, memberIds: home, holiday: off.name, name: n } })),
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
