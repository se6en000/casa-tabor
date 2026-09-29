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
  // Spirit and theme days (Jake, 2026-09-29): the outfit, before "Holiday Spirit Day" reads as no school.
  { kind: 'spirit_day', re: /\b(spirit (day|week)|pajama day|pj day|crazy (hair|socks?) day|hat day|twin day|jersey day|theme day|dress[- ]up day|color day|character day|decades? day|pink out|white out|tie[- ]dye day|red ribbon|wear (your |a |the )?\w+)\b/i, lead: 5, step: 'Outfit ready?' },
  { kind: 'hosting', re: /\b(thanksgiving|christmas day|easter|passover|hanukkah)\b/i, lead: 30, step: 'Hosting or going?' },
  { kind: 'no_school', re: /\b(holiday|no school|columbus day|veterans day|labor day|memorial day|mlk|presidents'? day|teacher (planning|workday)|early release|spring break|winter break)\b/i, allDayOnly: true, lead: 14, step: 'No school? Who’s with the kids' },
  { kind: 'deadline', re: /\b(due|deadline|registration|register|sign[- ]?ups?|forms?|aktivate)\b/i, lead: 7, step: 'Get it done' },
  // Something to bring (Jake, 2026-09-28: "planning to bring something"): a few days is enough.
  { kind: 'bring', re: /\b(potluck|bake sale|snack (duty|schedule)|snacks? for|class party|teacher appreciation|dish to pass|bring (a|your|snacks?))\b/i, lead: 3, step: 'Get what to bring' },
  { kind: 'party', re: /\b(party|celebration|shower|wedding|graduation|banquet|bar mitzvah|bat mitzvah|quincea|housewarming|baptism|christening|first communion|communion|confirmation|retirement|farewell|going[- ]away|gift exchange|secret santa|white elephant)/i, lead: 14, step: 'RSVP and get a gift', gifts: true },
  // Anyone's birthday or anniversary, not only the family's "dates we keep" (which get two months):
  // three weeks to order a card or gift and have it arrive.
  { kind: 'birthday', re: /\b(birthday|b-?day|anniversary)\b/i, lead: 21, step: 'Card or gift?', gifts: true },
  { kind: 'gift_holiday', re: /\b(mother'?s day|father'?s day|valentine'?s day)\b/i, lead: 14, step: 'Card or gift?' },
  { kind: 'sympathy', re: /\b(funeral|memorial service|celebration of life|wake|shiva)\b/i, lead: 2, step: 'Flowers or a card' },
  // Visitors (Jake, 2026-09-29): the guest room and groceries.
  { kind: 'guests', re: /\b(visiting|visit from|in town|staying with us|house ?guests?|coming to stay)\b/i, lead: 5, step: 'Guest room and groceries' },
  { kind: 'big_day', re: /\b(tryouts?|tournament|recital|concert|performance|showcase|competition|championship|camp)\b/i, lead: 14, step: 'Check what’s needed and who drives' },
  { kind: 'travel', re: /\b(flight|trip|hotel|vacation|cruise|travel)\b/i, lead: 30, step: 'Book and plan the trip' },
  { kind: 'appointment', re: /\b(dentist|doctor|pediatric\w*|orthodont\w*|check-?up|appointment|surgery|clinic|physical)\b/i, lead: 7, step: 'Make sure it works with work' },
  { kind: 'outing', re: /\b(preview|exhibition|tickets?|gala|fundraiser|premiere|play|musical)\b/i, lead: 7, step: 'Tickets, and who’s going' },
]

// The seasons, which no calendar carries (Jake, 2026-09-29: "we go all out" for Halloween and
// Christmas; Halloween decorations and costumes "more or less now so we beat the rush", Christmas
// decorating before Thanksgiving, gifts from November). `date` is the day itself; `poke` is when to start.
const thanksgiving = (y) => {
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay()
  return `${y}-11-${String(1 + ((4 - first + 7) % 7) + 21).padStart(2, '0')}`
}
export const SEASONS = [
  { id: 'halloween_decor', title: 'Halloween decorations', date: (y) => `${y}-10-31`, poke: (y) => `${y}-09-15`, step: 'Decorate now, before the rush' },
  { id: 'halloween_costumes', title: 'Halloween costumes', date: (y) => `${y}-10-31`, poke: (y) => `${y}-09-15`, step: 'Pick and order costumes' },
  { id: 'thanksgiving_prep', title: 'Thanksgiving prep', date: thanksgiving, poke: (y) => addDays(thanksgiving(y), -14), step: 'Plans, the menu and groceries' },
  { id: 'christmas_decor', title: 'Christmas decorating', date: (y) => `${y}-12-25`, poke: (y) => addDays(thanksgiving(y), -21), step: 'Decorate before Thanksgiving' },
  { id: 'christmas_lights', title: 'Christmas lights', date: (y) => `${y}-12-25`, poke: (y) => addDays(thanksgiving(y), -21), step: 'Lights up before Thanksgiving' },
  { id: 'christmas_gifts', title: 'Christmas gifts', date: (y) => `${y}-12-25`, poke: (y) => `${y}-11-01`, step: 'Start the gift list' },
  { id: 'christmas_cards', title: 'Christmas cards', date: (y) => `${y}-12-25`, poke: (y) => `${y}-11-15`, step: 'The photo and the card list' },
  { id: 'hurricane', title: 'Hurricane season', date: (y) => `${y}-06-01`, poke: (y) => `${y}-05-15`, step: 'Check the storm supplies' },
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
const ideaOwner = (g, family) => (g.for_member_id && family.find((m) => m.id === g.for_member_id)) || memberNamed(g.for_name, family)
const ideaNames = (g, family) => {
  const member = ideaOwner(g, family)
  return member ? namesOf(member) : [String(g.for_name ?? '').trim().toLowerCase()].filter(Boolean)
}
const wholeWord = (title, name) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i').test(title)

export function buildComingUp({ now, events, giftIdeas = [], state = {}, rules = [], family = [], seasons = [] }) {
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
    // The same person's birthday twice that day ("Carl's birthday", "Carl Tabor's birthday"; all-day
    // dates are stored two ways, so the moments differ): once, by first name and day.
    const who = k.kind === 'birthday' || k.kind === 'anniversary' ? String(e.title).trim().split(/[\s']/)[0].toLowerCase() : null
    const samePerson = who ? `${k.kind}@${date}@${who}` : null
    if (seen.has(same) || seen.has(sameMoment) || (samePerson && seen.has(samePerson))) continue
    const pokeOn = addDays(date, -k.lead)
    if (pokeOn > horizon) continue
    seen.add(same)
    seen.add(sameMoment)
    if (samePerson) seen.add(samePerson)
    const s = state[e.id] ?? {}
    if (s.done_at || s.dismissed_at) continue
    if (s.snoozed_until && s.snoozed_until > today) continue
    const title = String(e.title).trim()
    const matched = k.gifts ? giftIdeas.filter((g) => ideaNames(g, family).some((n) => wholeWord(title, n))) : null
    const ideas = matched?.map((g) => g.idea)
    // Whose ideas these are (family members only), so a phone can keep them from that person.
    const ideasFor = matched ? [...new Set(matched.map((g) => ideaOwner(g, family)?.id).filter(Boolean))] : null
    items.push({ key: e.id, kind: k.kind, title, date, daysAway: daysBetween(today, date), nextStep: k.step, pokeOn, late: pokeOn < today, ...(ideas ? { ideas, ideasFor } : {}) })
  }
  // This year's season, or next year's once this one has passed; keyed by year so "done" lasts a year.
  const year = Number(today.slice(0, 4))
  for (const season of seasons) {
    for (const y of [year, year + 1]) {
      const date = season.date(y)
      const pokeOn = season.poke(y)
      if (date < today || pokeOn > horizon) continue
      const key = `season:${season.id}:${y}`
      const s = state[key] ?? {}
      if (s.done_at || s.dismissed_at || (s.snoozed_until && s.snoozed_until > today)) break
      items.push({ key, kind: 'season', title: season.title, date, daysAway: daysBetween(today, date), nextStep: s.custom_step ?? season.step, pokeOn, late: pokeOn < today })
      break
    }
  }
  return items.sort((a, b) => a.pokeOn.localeCompare(b.pokeOn) || a.date.localeCompare(b.date))
}
