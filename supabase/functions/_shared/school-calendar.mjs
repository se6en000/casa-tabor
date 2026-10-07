// The kids' school calendar (Jake, Oct 7: "I just alexa /AI to have knowledge of them and be proactive with them
// espcially gift and potential long school vacation holidays like thanksgiveing / xmas, spring break florida, etc").
// Both schools (Palm Beach Public Elementary, Bak Middle School of the Arts) are the School District of Palm Beach
// County's; its no-school days for students, from the district's published 2026–27 calendar (via
// floridaschoolcalendar.com/palm-beach/2026-2027, read Oct 7, 2026). A new school year goes in when the district
// publishes it; past the end of what's here, the federal holidays (holidays.ts) stand in. Pure.

export const SCHOOL_DISTRICT = 'Palm Beach County schools'

export const SCHOOL_YEARS = [
  {
    year: '2026-27', first: '2026-08-10', last: '2027-05-27',
    off: [
      { from: '2026-09-07', to: '2026-09-07', name: 'Labor Day' },
      { from: '2026-09-21', to: '2026-09-21', name: 'Fall Holiday' },
      { from: '2026-10-12', to: '2026-10-12', name: 'Columbus Day' },
      { from: '2026-11-03', to: '2026-11-03', name: 'Election Day (no school)' },
      { from: '2026-11-11', to: '2026-11-11', name: 'Veterans Day' },
      { from: '2026-11-23', to: '2026-11-27', name: 'Thanksgiving break' },
      { from: '2026-12-21', to: '2027-01-01', name: 'Winter break' },
      { from: '2027-01-04', to: '2027-01-04', name: 'No school (teacher day)' },
      { from: '2027-01-18', to: '2027-01-18', name: 'Martin Luther King Jr. Day' },
      { from: '2027-02-15', to: '2027-02-15', name: 'Presidents’ Day' },
      { from: '2027-03-10', to: '2027-03-10', name: 'Spring Holiday' },
      { from: '2027-03-22', to: '2027-03-26', name: 'Spring break' },
      { from: '2027-03-29', to: '2027-03-29', name: 'No school (teacher day)' },
    ],
  },
]

/** The last day the school calendar here covers; after it, the federal holidays stand in. */
export const SCHOOL_CALENDAR_UNTIL = SCHOOL_YEARS.at(-1).last

/** No-school days and breaks overlapping [fromYmd, toYmd], soonest first, each with its school days counted. */
export function schoolDaysOff(fromYmd, toYmd) {
  return SCHOOL_YEARS.flatMap((y) => y.off)
    .filter((o) => o.to >= fromYmd && o.from <= toYmd)
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((o) => ({ ...o, schoolDays: weekdaysBetween(o.from, o.to) }))
}

/** Weekdays from a to b, inclusive (YYYY-MM-DD). */
export function weekdaysBetween(a, b) {
  let n = 0
  for (let t = Date.parse(`${a}T12:00:00Z`); t <= Date.parse(`${b}T12:00:00Z`); t += 86400e3) {
    const d = new Date(t).getUTCDay()
    if (d !== 0 && d !== 6) n += 1
  }
  return n
}

/** A long break (a week or more off): planned ahead — a trip, camp, or who has the kids. */
export const isLongBreak = (o) => weekdaysBetween(o.from, o.to) >= 5

/** "Mon Dec 21 – Fri Jan 1" */
export function rangeWords(from, to) {
  const say = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
  return from === to ? say(from) : `${say(from)} – ${say(to)}`
}

const ymdUTC = (d) => d.toISOString().slice(0, 10)
const nthUTC = (y, m, wd, n) => { const first = new Date(Date.UTC(y, m, 1, 12)); return new Date(Date.UTC(y, m, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7, 12)) }
const lastUTC = (y, m, wd) => { const end = new Date(Date.UTC(y, m + 1, 0, 12)); return new Date(Date.UTC(y, m, end.getUTCDate() - ((end.getUTCDay() - wd + 7) % 7), 12)) }
/** A fixed-date holiday on a weekend is kept on the Friday before or the Monday after. */
const observedUTC = (d) => new Date(d.getTime() + (d.getUTCDay() === 6 ? -1 : d.getUTCDay() === 0 ? 1 : 0) * 86400e3)

/** The US federal holidays of a year (observed dates), plus the day after Thanksgiving, which schools take too. */
export function federalHolidays(year) {
  const thanksgiving = nthUTC(year, 10, 4, 4)
  return [
    ['New Year’s Day', observedUTC(new Date(Date.UTC(year, 0, 1, 12)))],
    ['Martin Luther King Jr. Day', nthUTC(year, 0, 1, 3)],
    ['Presidents’ Day', nthUTC(year, 1, 1, 3)],
    ['Memorial Day', lastUTC(year, 4, 1)],
    ['Juneteenth', observedUTC(new Date(Date.UTC(year, 5, 19, 12)))],
    ['Independence Day', observedUTC(new Date(Date.UTC(year, 6, 4, 12)))],
    ['Labor Day', nthUTC(year, 8, 1, 1)],
    ['Columbus Day', nthUTC(year, 9, 1, 2)],
    ['Veterans Day', observedUTC(new Date(Date.UTC(year, 10, 11, 12)))],
    ['Thanksgiving', thanksgiving],
    ['the day after Thanksgiving', new Date(thanksgiving.getTime() + 86400e3)],
    ['Christmas Day', observedUTC(new Date(Date.UTC(year, 11, 25, 12)))],
  ].map(([name, d]) => ({ name, ymd: ymdUTC(d) }))
}

/**
 * What Alexa and the morning brief know of the months ahead: the holidays and the kids' days off school, and what
 * to do with them (Jake, Oct 7: "be proactive with them espcially gift and potential long school vacation holidays").
 */
export function holidaysSection(todayYmd, months = 6) {
  const until = new Date(Date.parse(`${todayYmd}T12:00:00Z`) + months * 31 * 86400e3).toISOString().slice(0, 10)
  const y = Number(todayYmd.slice(0, 4))
  const federal = [y, y + 1].flatMap(federalHolidays).filter((h) => h.ymd >= todayYmd && h.ymd <= until && h.name !== 'the day after Thanksgiving')
  const school = schoolDaysOff(todayYmd, until)
  const lines = [
    ...federal.map((h) => ({ at: h.ymd, text: `${rangeWords(h.ymd, h.ymd)}: ${h.name}` })),
    ...school.map((o) => ({ at: o.from, text: `${rangeWords(o.from, o.to)}: no school — ${o.name}${isLongBreak(o) ? ` (${o.schoolDays} school days off)` : ''}` })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.text.includes('no school') ? 1 : -1))
  if (!lines.length) return null
  const known = todayYmd <= SCHOOL_CALENDAR_UNTIL ? `the kids' school days off are ${SCHOOL_DISTRICT}' published calendar until ${rangeWords(SCHOOL_CALENDAR_UNTIL, SCHOOL_CALENDAR_UNTIL)}` : 'the kids\' school calendar for this year isn\'t in yet — only the federal holidays are known'
  return `HOLIDAYS AND SCHOOL DAYS OFF (the next ${months} months; ${known}):
${lines.map((l) => `- ${l.text}`).join('\n')}
Be a step ahead with these: when plans, travel, childcare or gifts come up, or a long break or a gift holiday is within about six weeks, say so in a line — who has the kids that week, a trip or camp, Christmas gifts. Never make up a break or a closure that isn't listed.`
}
