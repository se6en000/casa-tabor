// The Scout (Jake, Oct 8: "the morning paper date suggestions. it gotta get A LOT better, suggesting sunfest this weekend
// is not good, its not even happening any more … a deep dive on all new restaraunts or hidden gems within 30 mins of the
// house, along with restaruants it should looks for workout events, like free events on the beach or downtown wpb. or
// pickleball or yoga or pilates, or other just fun couple events. but they should be legit real things we actually can
// do"). Twice a week it researches; nothing is kept unless it checks out — a restaurant is open and well rated on Google
// within half an hour of home, an event's own page still shows it on a coming date and doesn't say it's off. The paper
// and Alexa pick from what's kept. Pure, so every rule is tested without the network.

export const SCOUT_KINDS = ['restaurant', 'fitness', 'couple', 'family']
/** Half an hour from home, by road, estimated from the straight line (Palm Beach County roads: ~45 km/h door to door). */
export const MAX_DRIVE_MIN = 30
/** How far ahead an event may be to be kept. */
export const AHEAD_DAYS = 21
/** A suggestion isn't offered again for this long. */
export const REST_DAYS = 21

const TOWNS = 'West Palm Beach, Palm Beach, Lake Worth Beach, Lantana, Palm Beach Gardens, North Palm Beach, Juno Beach, Jupiter, Wellington, Royal Palm Beach, Boynton Beach and Delray Beach, Florida'
const SOURCES = 'the Palm Beach Post (palmbeachpost.com), wpb.org, thepalmbeaches.com, Palm Beach Illustrated, Palm Beach Daily News, Eventbrite, Meetup, the venues’ own sites and the cities’ calendars'

/** The research, lane by lane: what to look for, for whom. */
export const SCOUT_LANES = [
  { kind: 'fitness', ask: 'free or low-cost group workouts open to adults: beach or sunrise yoga, park yoga, pilates pop-ups, run clubs, outdoor bootcamps, paddleboard yoga' },
  { kind: 'fitness', ask: 'pickleball open play, social mixers and beginner clinics that welcome drop-in adults and couples' },
  { kind: 'couple', ask: 'good evenings out for a couple: live music and jazz nights, wine or cocktail tastings and classes, comedy shows, art walks and gallery nights, outdoor movies, food and wine events' },
  { kind: 'couple', ask: 'events downtown West Palm Beach and on the waterfront: Clematis Street, the Square (Rosemary Square), Northwood Village, the waterfront and the Norton Museum’s evenings' },
  { kind: 'restaurant', ask: 'restaurants that opened in the last four months, or are newly praised by local critics' },
  { kind: 'family', ask: 'family outings for a weekend: markets, festivals, free shows and kids’ events' },
]

/** One lane's search: real things only, with their own page, as JSON. */
export function laneSearchPrompt(lane, { today, until, area = TOWNS }) {
  const dated = lane.kind !== 'restaurant'
  return `Search the web for ${lane.ask}, in or near ${area} (within about 30 minutes' drive of West Palm Beach). Today is ${today}.
${dated ? `Only things happening between today and ${until}, or that happen every week right now (say which day and time). Nothing that has ended, been cancelled or moved online; nothing before today.` : 'Only places open now, with their town.'}
Prefer what ${SOURCES} list. Real, current things only — if you are not sure it is on, leave it out.
Answer with only a JSON array (no prose), up to 6 items: [{"kind": "fitness" (a workout), "couple" (good for two adults) or "family" (for kids), "title": "its exact name", "when": "YYYY-MM-DD HH:MM" or null, "recurring": "every Thursday 6–9 PM" or null, "place": "venue or area", "address": "street address, town" or null, "url": "the page that lists it (the event's or venue's own page)", "why": "one short line: what makes it worth going to", "free": true or false or null}]`
}

/** The JSON array out of a model's answer (it may wrap it in prose or a code fence). */
export function parseCandidates(text, kind, today = null) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
  return arr.filter((o) => o && typeof o === 'object' && str(o.title, 140)).slice(0, 8).map((o) => datedFromRecurring({
    kind: SCOUT_KINDS.includes(o.kind) ? o.kind : kind,
    title: str(o.title, 140),
    when: typeof o.when === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(o.when.trim()) ? o.when.trim() : null,
    recurring: str(o.recurring, 80),
    place: str(o.place, 120),
    address: str(o.address, 200),
    url: typeof o.url === 'string' && /^https?:\/\//.test(o.url.trim()) ? o.url.trim() : null,
    why: str(o.why, 200),
    free: typeof o.free === 'boolean' ? o.free : null,
  }, today))
}

/**
 * A "weekly" line that's really dates ("October 9 & 23, 2:00 PM", "Friday, October 9 (6-11 PM), Saturday, October 10"):
 * its first date becomes its date, so its page has to show that date (the weekly check is looser).
 */
export function datedFromRecurring(c, today) {
  if (c.when || !c.recurring) return c
  const m = c.recurring.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})\b/)
  if (!m || !today) return c
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3))) + 1
  let year = Number(today.slice(0, 4))
  const ymd = (y) => `${y}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
  if (ymd(year) < addDays(today, -1)) year += 1
  // A range ("6-11 PM") starts at its first time, in its last one's half of the day.
  const time = c.recurring.match(/(\d{1,2})(?::(\d{2}))?\s*(?:[-–]\s*\d{1,2}(?::\d{2})?\s*)?(am|pm|a\.m\.|p\.m\.)/i)
  const hh = time ? (Number(time[1]) % 12) + (/p/i.test(time[3]) ? 12 : 0) : null
  return { ...c, when: hh != null ? `${ymd(year)} ${String(hh).padStart(2, '0')}:${time[2] ?? '00'}` : ymd(year), recurring: null }
}

const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'at', 'in', 'on', 'for', 'with', 'to', 'by', 'night', 'event', 'events', 'west', 'palm', 'beach', 'fl', 'florida'])
const words = (t) => [...new Set(String(t ?? '').toLowerCase().replace(/&amp;/g, '&').replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))]
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** A page as plain lowercase text: tags, scripts and styles out (JSON-LD kept: event pages carry their dates there). */
export function pageText(html) {
  return String(html ?? '')
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** The ways a page may write a date ("October 18", "Oct. 18", "10/18", "2026-10-18", "Saturday, Oct 18"). */
function dateForms(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const month = MONTHS[m - 1]
  return [
    `${month} ${d}`, `${month.slice(0, 3)} ${d}`, `${month.slice(0, 3)}. ${d}`, `${month} ${String(d).padStart(2, '0')}`,
    `${m}/${d}/`, `${m}/${d} `, `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`,
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, `${d} ${month}`,
  ]
}

/**
 * Its name on the page as a name, not scattered words: most of its words within a few lines of one of them ("Thursday",
 * "nights" and "Wellington" each somewhere on a page about the Norton is not "Thursday Nights in Wellington").
 */
function nameTogether(name, text) {
  const need = Math.max(1, Math.ceil(name.length * 0.6))
  const anchor = [...name].sort((a, b) => b.length - a.length)[0]
  let at = text.indexOf(anchor)
  while (at >= 0) {
    const near = text.slice(Math.max(0, at - 160), at + 160)
    if (name.filter((w) => near.includes(w)).length >= need) return true
    at = text.indexOf(anchor, at + anchor.length)
  }
  return false
}

const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Whether a candidate's own page backs it up: its name is on the page (most of its words); a dated one is on a coming
 * date within AHEAD_DAYS that the page shows; a weekly one names its day; and nothing near its name says it's off.
 */
export function pageVerdict(candidate, text, today, { minLength = 200, current = false } = {}) {
  if (!text || text.length < minLength) return { ok: false, note: 'the page is empty or blocked' }
  const name = words(candidate.title)
  if (!name.length || !nameTogether(name, text)) return { ok: false, note: 'its name isn’t on the page' }
  // "Cancelled", "postponed", "sold out", "no longer": anywhere in the page's first part, or near its name.
  const off = /\b(cancel+ed|postponed|sold out|no longer (held|taking place|happening)|has been called off|will not take place|discontinued|permanently closed)\b/
  const at = text.indexOf(name[0])
  const near = at >= 0 ? text.slice(Math.max(0, at - 300), at + 600) : ''
  // Near its own name only: a calendar page lists many things, and one called off isn't this one.
  if (off.test(near)) return { ok: false, note: 'the page says it’s off' }
  if (candidate.kind === 'restaurant') return { ok: true, note: 'its page is up' }
  const day = candidate.when?.slice(0, 10) ?? null
  if (day) {
    if (day < today) return { ok: false, note: 'it’s past' }
    if (day > addDays(today, AHEAD_DAYS)) return { ok: false, note: 'too far off' }
    if (!dateForms(day).some((f) => text.includes(f))) return { ok: false, note: 'the page doesn’t show that date' }
    return { ok: true, note: 'its page shows the date' }
  }
  if (candidate.recurring) {
    const weekday = DAYS.find((d) => candidate.recurring.toLowerCase().includes(d) || candidate.recurring.toLowerCase().includes(d.slice(0, 3)))
    if (weekday && !text.includes(weekday) && !text.includes(`${weekday.slice(0, 3)}s`)) return { ok: false, note: 'the page doesn’t name its day' }
    // A weekly thing on a page that's still current: this year, or next month, somewhere on it.
    const year = today.slice(0, 4)
    const nextMonth = MONTHS[Number(addDays(today, 30).slice(5, 7)) - 1]
    // (A quote a search just found is current by its nature.)
    if (!current && !text.includes(year) && !text.includes(nextMonth)) return { ok: false, note: 'the page may be stale' }
    return { ok: true, note: 'its page lists it weekly' }
  }
  return { ok: false, note: 'no date' }
}

const NEAR = ['west palm', 'palm beach', 'lake worth', 'lantana', 'palm beach gardens', 'north palm', 'juno', 'jupiter', 'tequesta', 'wellington', 'royal palm', 'loxahatchee', 'greenacres', 'boynton', 'delray', 'riviera beach', 'singer island', 'palm springs', 'hypoluxo', 'manalapan', 'ocean ridge', 'gulf stream', 'highland beach', 'lake park']
const FAR = ['miami', 'fort lauderdale', 'ft. lauderdale', 'hollywood', 'pompano', 'stuart', 'port st', 'orlando', 'tampa', 'naples', 'fort myers', 'key west', 'vero beach', 'hobe sound', 'sunrise, fl', 'coral springs', 'deerfield', 'boca raton']
/**
 * Whether an event's place is within reach, from its address or venue words: a town in Palm Beach County's half hour → true,
 * one well beyond it (Miami, Fort Lauderdale, Boca's far side counts as far) → false, none named → null (the search was
 * already asked for the half hour).
 */
export function townInReach(text) {
  const t = String(text ?? '').toLowerCase()
  if (!t) return null
  if (FAR.some((f) => t.includes(f))) return false
  if (NEAR.some((n) => t.includes(n))) return true
  return null
}

/** Kilometres between two points. */
export function haversineKm(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Minutes by road, estimated: about 45 km/h door to door, plus parking. */
export const driveMinutes = (km) => Math.round(km / 0.75 + 4)

/**
 * A restaurant from Google Places, if it's worth suggesting: open, well rated by enough people, within half an hour.
 * "Hidden gem": excellent with few reviews; "new": found as newly opened (fewer reviews allowed).
 */
export function restaurantVerdict(place, home, { fresh = false } = {}) {
  if (!place || place.businessStatus !== 'OPERATIONAL') return { ok: false, note: 'not open' }
  const rating = Number(place.rating ?? 0)
  const count = Number(place.userRatingCount ?? 0)
  const loc = place.location ? { lat: place.location.latitude, lng: place.location.longitude } : null
  if (!loc || !home) return { ok: false, note: 'no location' }
  const minutes = driveMinutes(haversineKm(home, loc))
  if (minutes > MAX_DRIVE_MIN) return { ok: false, note: `about ${minutes} min away` }
  if (fresh ? rating < 4.3 || count < 12 : rating < 4.5 || count < 40) return { ok: false, note: `${rating} from ${count}` }
  const gem = !fresh && rating >= 4.6 && count <= 600
  return { ok: true, minutes, gem, note: fresh ? `new · ${rating} from ${count}` : gem ? `hidden gem · ${rating} from ${count}` : `${rating} from ${count}` }
}

/** One key per thing (an event per day; a place once): repeats from two searches, or two weeks of a newsletter, merge. */
export function dedupeKey(o) {
  const base = words(o.place && o.kind === 'restaurant' ? o.place : o.title).slice(0, 5).join('-')
  // An event is one event whoever it's for (Clematis by Night came back as both a couple's and a family's).
  return o.kind === 'restaurant' ? `r:${base}` : `e:${base}:${o.when?.slice(0, 10) ?? o.recurring?.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 30) ?? ''}`
}

/** A newsletter issue (the Palm Beach Post's, the city's): the outings in it, as the lanes' JSON. */
export function newsletterPrompt(email, today) {
  return `This is a local newsletter the family subscribes to (${String(email.from_email ?? '').slice(0, 80)}, "${String(email.subject ?? '').slice(0, 120)}"). Today is ${today}.
Pick out what a couple in their forties in West Palm Beach might actually go to, from now until ${addDays(today, AHEAD_DAYS)}: restaurants (new or notable), free or low-cost workouts (yoga, pilates, run clubs, pickleball), evenings out (music, tastings, comedy, art walks, downtown events) and weekend family outings. Skip ads, deals, real estate, news and anything past or outside about 30 minutes of West Palm Beach.
Answer with only a JSON array, up to 10 items: [{"kind": "restaurant" | "fitness" | "couple" | "family", "title": "...", "when": "YYYY-MM-DD HH:MM" or null, "recurring": "..." or null, "place": "...", "address": "..." or null, "url": "its link in the email" or null, "why": "one short line", "free": true or false or null}]
The email:
${String(email.body ?? '').slice(0, 24000)}`
}

const evening = (o) => {
  const h = Number(o.when?.slice(11, 13) ?? NaN)
  return Number.isFinite(h) && h >= 17
}

/**
 * What the paper offers today, best first: things on soon and on a day that's free; couple and fitness first (Jake: the
 * two of them), a family outing on a weekend; never one offered in the last REST_DAYS, said no to, or already been to.
 * `busy`: YYYY-MM-DD → true when that evening is spoken for.
 */
export function scoutPicks(rows, { today, busy = {}, n = 3 }) {
  const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
  const rested = (o) => !o.offered_on || o.offered_on <= addDays(today, -REST_DAYS)
  const live = (rows ?? []).filter((o) => ['new', 'saved', 'offered'].includes(o.status ?? 'new') && rested(o)
    && (!o.when || (o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 9))))
  const score = (o) => {
    let s = { couple: 30, fitness: 28, restaurant: 26, family: 12 }[o.kind] ?? 0
    const day = o.when?.slice(0, 10)
    if (day) {
      s += 10 - Math.min(9, Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000))
      if (evening(o) && busy[day]) s -= 25
      if (o.kind === 'family' && [0, 6].includes(weekday(day))) s += 14
    }
    if (o.status === 'saved') s += 6
    if (o.gem) s += 4
    if (o.source === 'email') s += 3
    // Its own page read beats a search's word for it.
    if (/confirmed by a search/.test(o.verify_note ?? '')) s -= 5
    return s
  }
  const out = []
  const kinds = new Set()
  for (const o of live.sort((a, b) => score(b) - score(a))) {
    if (out.length >= n) break
    // A spread: one of each kind before a second of any.
    if (kinds.has(o.kind) && live.some((x) => !kinds.has(x.kind) && !out.includes(x))) continue
    out.push(o)
    kinds.add(o.kind)
  }
  return out
}

/** The paper's notes on them: verified facts only, each with its id, so the writer names one and it's marked offered. */
export function scoutNotes(picks) {
  return picks.map((o) => [
    `[${o.id}] ${o.kind}: ${o.title}`,
    o.when ? `on ${o.when}` : o.recurring ? o.recurring : null,
    o.place ? `at ${o.place}` : null,
    o.drive_min ? `about ${o.drive_min} min from home` : null,
    o.rating ? `${o.rating}★ from ${o.rating_count}` : null,
    o.free ? 'free' : null,
    o.why,
  ].filter(Boolean).join(' · ')).join('\n')
}

/**
 * Alexa's section (Jake: "anything fun this weekend?", date night, a workout): what the Scout checked, soonest first and
 * saved ones in, never one said no to — at most 15 lines, with the rule that she suggests only these (or a fresh search).
 */
export function outingsSection(rows, today) {
  const live = (rows ?? []).filter((o) => ['new', 'offered', 'saved'].includes(o.status ?? 'new') && (!o.when || (o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 14))))
  const dated = live.filter((o) => o.when).sort((a, b) => a.when.localeCompare(b.when)).slice(0, 7)
  const weekly = live.filter((o) => !o.when && o.kind !== 'restaurant').slice(0, 3)
  const places = live.filter((o) => o.kind === 'restaurant').sort((a, b) => Number(b.status === 'saved') - Number(a.status === 'saved') || Number(b.gem) - Number(a.gem) || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5)
  const all = [...dated, ...weekly, ...places]
  if (!all.length) return null
  const line = (o) => `- ${o.kind}: ${o.title}${o.when ? ` · ${o.when}` : o.recurring ? ` · ${o.recurring}` : ''}${o.place && o.place !== o.title ? ` · ${o.place}` : ''}${o.drive_min ? ` · ~${o.drive_min} min` : ''}${o.rating ? ` · ${o.rating}★ (${o.rating_count})` : ''}${o.gem ? ' · hidden gem' : ''}${o.free ? ' · free' : ''}${o.status === 'saved' ? ' · they saved it' : ''}${o.why ? ` — ${o.why}` : ''}`
  return `OUT AND ABOUT (the Scout's list: checked this week as real, on, and within half an hour of home): when they ask for something to do, a date night, a new restaurant or a workout (yoga, pilates, run club, pickleball), suggest from these — two to four, each with when and where, leaning to the two of them unless the kids are asked about. Never suggest a place or event that isn't here unless search_web finds it right now, and never one they've said no to. "Put it on the calendar" is create_event.\n${all.map(line).join('\n')}`
}
