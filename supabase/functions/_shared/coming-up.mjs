// The "coming up" digest (FAMILY_WALL_PLAN.md P3.19 step 3): only what needs lead time, each with one
// next step and one "poke me" date. Casa's earlier prep systems generated thousands of items and
// were ignored (3,414 checklist items, 20 checked; 92% of email prep items dismissed), so this one
// stays small: a handful of kinds, one step each, and a poke on the day it's worth doing.
// Shared by the `coming-up` function (wall, phone, pushes) and its tests.
import { memberNamed, namesOf } from './family-names.mjs'

const DAY = 86400e3
const TZ = 'America/New_York'
/** How far ahead the digest looks: the poke has to fall within six weeks. */
export const COMING_UP_WEEKS = 6

const isRoutineCopy = (title) => /^(drop off|pick up) \S+ @ /i.test(title)

// Birthdays and relationship dates two months ahead (Jake, 2026-09-27); a remembrance a week ahead, no gift.
const KEPT = {
  birthday: { lead: 60, step: 'Pick a gift', gifts: true },
  anniversary: { lead: 60, step: 'Plan something together', gifts: true },
  remembrance: { lead: 7, step: 'A quiet day to remember', gifts: false },
}
// First match wins.
const KINDS = [
  { kind: 'hosting', re: /\b(thanksgiving|christmas day|easter|passover|hanukkah)\b/i, lead: 30, step: 'Hosting or going?' },
  { kind: 'no_school', re: /\b(holiday|no school|columbus day|veterans day|labor day|memorial day|mlk|presidents'? day|teacher (planning|workday)|early release|spring break|winter break)\b/i, allDayOnly: true, lead: 14, step: 'No school? Who’s with the kids' },
  { kind: 'deadline', re: /\b(due|deadline|registration|register|sign[- ]?ups?|forms?|aktivate)\b/i, lead: 7, step: 'Get it done' },
  { kind: 'party', re: /\b(party|celebration|shower|wedding|graduation|banquet|bar mitzvah|bat mitzvah|quincea)/i, lead: 14, step: 'RSVP and get a gift', gifts: true },
  { kind: 'big_day', re: /\b(tryouts?|tournament|recital|concert|performance|showcase|competition|championship|camp)\b/i, lead: 14, step: 'Check what’s needed and who drives' },
  { kind: 'travel', re: /\b(flight|trip|hotel|vacation|cruise|travel)\b/i, lead: 30, step: 'Book and plan the trip' },
  { kind: 'appointment', re: /\b(dentist|doctor|pediatric\w*|orthodont\w*|check-?up|appointment|surgery|clinic|physical)\b/i, lead: 7, step: 'Make sure it works with work' },
  { kind: 'outing', re: /\b(preview|exhibition|tickets?|gala|fundraiser|premiere|play|musical)\b/i, lead: 7, step: 'Tickets, and who’s going' },
]

const localDate = (e) => {
  if (e.all_day) return String(e.start_time).slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.start_time))
}
const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY)

const builtIn = (e) => {
  for (const k of KINDS) {
    if (k.allDayOnly && !e.all_day) continue
    if (k.re.test(e.title)) return k
  }
  return null
}

/** The family's own words win: something added by voice, then their "every time" rules, then Casa's kinds. */
function classify(e, rules, custom) {
  const kept = /date we keep · (birthday|anniversary|remembrance)/i.exec(String(e.description ?? ''))
  if (kept) return { kind: kept[1].toLowerCase(), ...KEPT[kept[1].toLowerCase()] }
  if (custom?.custom_step) return { kind: 'added', lead: custom.custom_lead_days ?? 7, step: custom.custom_step }
  if (isRoutineCopy(e.title)) return null
  const title = String(e.title).toLowerCase()
  const rule = rules.find((r) => r.match && String(r.match).toLowerCase().split(/\s+/).filter(Boolean).every((w) => title.includes(w)))
  const base = builtIn(e)
  if (rule) {
    if (rule.off) return null
    return { kind: base?.kind ?? 'rule', gifts: base?.gifts, lead: rule.lead_days ?? base?.lead ?? 7, step: rule.step || base?.step || 'Get ready' }
  }
  return base
}

/**
 * The digest as of `now`: items whose poke falls within six weeks (or has passed) and that haven't
 * happened, minus the ones marked done, not needed, or snoozed. In poke order.
 * `state`: { [key]: { done_at?, dismissed_at?, snoozed_until?, custom_step?, custom_lead_days? } }.
 * `rules`: the family's "every time" rules: { match (words in the title), step?, lead_days?, off? }.
 */
// Whose idea it is, by every name they go by ("Olivia" → Liv's birthday); anyone else by the name saved.
const ideaNames = (g, family) => {
  const member = (g.for_member_id && family.find((m) => m.id === g.for_member_id)) || memberNamed(g.for_name, family)
  return member ? namesOf(member) : [String(g.for_name ?? '').trim().toLowerCase()].filter(Boolean)
}
const wholeWord = (title, name) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i').test(title)

export function buildComingUp({ now, events, giftIdeas = [], state = {}, rules = [], family = [] }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const horizon = addDays(today, COMING_UP_WEEKS * 7)
  const seen = new Set()
  const items = []
  const sorted = [...(events ?? [])].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  for (const e of sorted) {
    const k = classify(e, rules, state[e.id])
    if (!k) continue
    const date = localDate(e)
    if (date < today) continue
    // The same thing twice: by name (repeats), or the same kind at the same moment under two names.
    const same = `${String(e.title).trim().toLowerCase()}|${k.kind}`
    const sameMoment = `${k.kind}@${e.start_time}`
    if (seen.has(same) || seen.has(sameMoment)) continue
    const pokeOn = addDays(date, -k.lead)
    if (pokeOn > horizon) continue
    seen.add(same)
    seen.add(sameMoment)
    const s = state[e.id] ?? {}
    if (s.done_at || s.dismissed_at) continue
    if (s.snoozed_until && s.snoozed_until > today) continue
    const title = String(e.title).trim()
    const ideas = k.gifts
      ? giftIdeas.filter((g) => ideaNames(g, family).some((n) => wholeWord(title, n))).map((g) => g.idea)
      : undefined
    items.push({ key: e.id, kind: k.kind, title, date, daysAway: daysBetween(today, date), nextStep: k.step, pokeOn, late: pokeOn < today, ...(ideas ? { ideas } : {}) })
  }
  return items.sort((a, b) => a.pokeOn.localeCompare(b.pokeOn) || a.date.localeCompare(b.date))
}
