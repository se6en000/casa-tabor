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
Locals' picks only (Jake: "the last thing I want to hear about is typical tourist stuff / referral bait"): nothing aimed at visitors (sightseeing, boat or trolley tours, souvenir spots, resort or hotel packages) and no sponsored, affiliate, giveaway or "top 10" picks.
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
  // Two places are two things ("Live Trivia, Mondays" at two bars — the first calendar run, Oct 8).
  const at = o.place && !words(o.title).some((w) => words(o.place).includes(w)) ? `@${words(o.place).slice(0, 3).join('-')}` : ''
  return o.kind === 'restaurant' ? `r:${base}` : `e:${base}${at}:${o.when?.slice(0, 10) ?? o.recurring?.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 30) ?? ''}`
}

/** A newsletter issue (the Palm Beach Post's, the city's): the outings in it, as the lanes' JSON. */
export function newsletterPrompt(email, today) {
  return `This is a local newsletter the family subscribes to (${String(email.from_email ?? '').slice(0, 80)}, "${String(email.subject ?? '').slice(0, 120)}"). Today is ${today}.
Pick out what a couple in their forties in West Palm Beach might actually go to, from now until ${addDays(today, AHEAD_DAYS)}: restaurants (new or notable), free or low-cost workouts (yoga, pilates, run clubs, pickleball), evenings out (music, tastings, comedy, art walks, downtown events) and weekend family outings. Skip ads, deals, real estate, news and anything past or outside about 30 minutes of West Palm Beach. Locals' picks only (Jake: "the last thing I want to hear about is typical tourist stuff / referral bait"): nothing aimed at visitors (sightseeing, boat or trolley tours, souvenir spots, resort or hotel packages) and no sponsored, affiliate, giveaway or "top 10" picks.
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
  const rested = (o) => !o.offered_on || o.offered_on <= addDays(today, -REST_DAYS)
  const live = (rows ?? []).filter((o) => SCOUT_KINDS.includes(o.kind) && ['new', 'saved', 'offered'].includes(o.status ?? 'new') && rested(o)
    && (!o.when || (o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 9))))
  const score = (o) => scoutScore(o, today, busy)
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

/** How good a pick is today (scoutPicks, outAndAbout): soon, free that evening, the kinds for the two of them first. */
export function scoutScore(o, today, busy = {}) {
  const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
  let s = { couple: 30, comedy: 29, fitness: 28, music: 27, restaurant: 26, trivia: 24, family: 12 }[o.kind] ?? 0
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

/**
 * The paper's second page, Out & about (canvas 72B): the two best of each kind — for the two of them, for the family,
 * to get moving, new spots — on now or in the next two weeks, never one said no to. Offered recently is fine here (it's
 * a list to browse, not the day's surprise).
 */
export function outAndAbout(rows, { today, busy = {}, each = 2 }) {
  const live = (rows ?? []).filter((o) => ['new', 'saved', 'offered'].includes(o.status ?? 'new') && (!o.when || (o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 14))))
  const ranked = (kinds) => live.filter((o) => kinds.includes(o.kind)).sort((a, b) => scoutScore(b, today, busy) - scoutScore(a, today, busy))
  const best = (kind) => ranked([kind]).slice(0, each)
  // For the two of you (Jake, Oct 8: "make the trivia concerts, etc just part of the out and about"): the best evening out
  // and the best gig, comedy show or trivia night from the calendars — the rest of either when one runs short.
  const evenings = ranked(['couple'])
  // A spread: after the best gig, one of another kind (a trivia night beside a band) before a second of the same.
  const gigs = ranked(CALENDAR_KINDS)
  const other = gigs.findIndex((g) => gigs[0] && g.kind !== gigs[0].kind)
  if (other > 1) gigs.splice(1, 0, ...gigs.splice(other, 1))
  const couple = [...evenings.slice(0, Math.ceil(each / 2)), ...gigs.slice(0, Math.floor(each / 2))]
  for (const extra of [...evenings, ...gigs]) if (couple.length < each && !couple.includes(extra)) couple.push(extra)
  return { couple: couple.slice(0, each), family: best('family'), fitness: best('fitness'), restaurant: best('restaurant') }
}

/**
 * The front page's "This weekend" (Jake, Oct 8: "pick a couples thing with a high percentage of impact — a highlight from
 * the Out and about"): the best thing for the two of them from Friday to Sunday — the coming weekend, or the rest of this
 * one — a dated one before a weekly one; with nothing on the weekend, the best of the week, called that. Null with none.
 */
export function weekendHighlight(rows, { today, busy = {} }) {
  const couple = outAndAbout(rows, { today, busy, each: 99 }).couple
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay()
  const friday = addDays(today, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow)
  const days = [0, 1, 2].map((i) => addDays(friday, i)).filter((d) => d >= today)
  const names = days.map((d) => DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()])
  const onWeekend = (o) => (o.when ? days.includes(o.when.slice(0, 10)) : names.some((n) => new RegExp(`\\b${n}`, 'i').test(o.recurring ?? '')) || /weekend/i.test(o.recurring ?? ''))
  const best = (list) => [...list].sort((a, b) => scoutScore(b, today, busy) - scoutScore(a, today, busy) || Number(Boolean(b.when)) - Number(Boolean(a.when)))[0]
  const weekend = couple.filter(onWeekend)
  if (weekend.length) return { label: 'This weekend', outing: best(weekend) }
  const week = couple.filter((o) => !o.when || o.when.slice(0, 10) <= addDays(today, 7))
  return week.length ? { label: 'This week', outing: best(week) } : null
}

/** An outing's when, as the paper says it: "Fri, Oct 16 · 6 PM", or its weekly line; null for a place (no when). */
export function outingWhen(o) {
  if (o.when) {
    const d = new Date(`${o.when.slice(0, 10)}T12:00:00Z`)
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const m = /(\d{2}):(\d{2})$/.exec(o.when.length > 10 ? o.when : '')
    if (!m) return day
    const h = Number(m[1])
    return `${day} · ${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`} ${h < 12 ? 'AM' : 'PM'}`
  }
  return o.recurring ?? null
}

/** Where "Phone" on the paper goes: a restaurant on Google Maps (directions, hours, the menu); an event, its own page. */
export function outingLink(o) {
  if (o.kind !== 'restaurant' && o.url) return o.url
  const q = encodeURIComponent([o.title, o.address ?? o.place].filter(Boolean).join(' '))
  return `https://www.google.com/maps/search/?api=1&query=${q}${o.google_place_id ? `&query_place_id=${encodeURIComponent(o.google_place_id)}` : ''}`
}

// Around town (canvas 72C; Jake, Oct 8: "family news with outside news"): the week's emails from the schools, the city
// and county and the local papers, boiled down to what reaches this family. Each line traces to a real email.
export const NEWS_SECTIONS = ['schools', 'city', 'papers']
/** Who writes the news (ilike patterns on the sender): the schools, the city and county, the papers. */
export const NEWS_SENDERS = ['%palmbeachschools%', '%schoolmessenger%', '%parentsquare%', '%k12.fl%', '%wpb.org%', '%govdelivery%', '%pbcgov%', '%pbc.gov%', '%palmbeachpost%', '%pbpost%', '%thepalmbeaches%', '%palmbeachdailynews%', '%palmbeachillustrated%', '%palmbeachculture%']

const SENDER_SECTIONS = [
  ['schools', /palmbeachschools|schoolmessenger|parentsquare|k12\.fl/i],
  ['city', /wpb\.org|govdelivery|pbcgov|pbc\.gov/i],
  ['papers', /palmbeachpost|pbpost|thepalmbeaches|palmbeachdailynews|palmbeachillustrated|palmbeachculture/i],
]
const senderSection = (from) => SENDER_SECTIONS.find(([, re]) => re.test(from ?? ''))?.[0] ?? null

/** True when every date a line names ("October 6", "Oct 6, 2026") is before today — it's over; no dates, false. */
function allPast(text, today) {
  const year = Number(today.slice(0, 4))
  const dates = [...String(text).matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/gi)]
    .map((m) => {
      const md = `${String(MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase())) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
      // No year and months behind ("October 3 to April 25"): next year's.
      return m[3] ? `${m[3]}-${md}` : `${year}-${md}` < addDays(today, -90) ? `${year + 1}-${md}` : `${year}-${md}`
    })
  return dates.length > 0 && dates.every((d) => d < today)
}

export function townNewsPrompt(emails, { today, family }) {
  const list = emails.map((e) => `--- [${e.id}] from ${String(e.from ?? '').slice(0, 100)} · "${String(e.subject ?? '').slice(0, 140)}" · received ${e.received}
${String(e.body ?? '').replace(/\s+/g, ' ').slice(0, 4000)}`).join('\n\n')
  return `You write the "Around town" page of a family's morning paper, on the kitchen wall. Today is ${today}. The family: ${family}. They live in West Palm Beach, Florida.
Below are the last week's emails from the kids' schools, the city and county, and the local papers they subscribe to. Pick only the news that reaches this family and is still ahead or still true (anything dated before today is over — leave it out): a change at their school, a date to know, something the kids can do, a city or county decision that touches them, what's on in town. Skip fundraising asks and sales, things already past, other schools' and grades' news unless it matters to them, account and payment notices, and anything private (grades, health, money).
Sections: "schools" (their schools and the school district), "city" (the city and county), "papers" (the local papers and magazines). Up to four in each, most useful first; fewer is fine.
Each: "headline" — eight words at most, plain; "line" — one sentence, under 30 words, why it matters to them, with the date if there is one; "source" — the sender in plain words ("Palm Beach Public", "City of West Palm Beach", "Palm Beach Post"); "ref" — the email's id exactly as in the brackets.
Answer with only a JSON array: [{"section": "schools" | "city" | "papers", "headline": "...", "line": "...", "source": "...", "ref": "..."}]

${list}`
}

/** The writer's answer, kept only where it names a real email, a known section, and isn't said twice; four a section. */
export function parseTownNews(text, { refs, today }) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
  const seen = new Set()
  const count = {}
  const out = []
  for (const o of arr) {
    if (!o || typeof o !== 'object' || !NEWS_SECTIONS.includes(o.section)) continue
    const headline = str(o.headline, 100)
    const line = str(o.line, 260) ?? ''
    const ref = refs.get(String(o.ref ?? ''))
    if (!headline || !ref || seen.has(headline.toLowerCase()) || allPast(`${headline} ${line}`, today)) continue
    // Who sent it decides where it goes (a school's note on a concert is the school's news); the writer's word otherwise.
    const section = senderSection(ref.from) ?? o.section
    if ((count[section] ?? 0) >= 4) continue
    seen.add(headline.toLowerCase())
    out.push({ news_date: today, section, headline, line, source: str(o.source, 60) ?? ref.from, source_date: ref.received, source_ref: String(o.ref), rank: count[section] ?? 0 })
    count[section] = (count[section] ?? 0) + 1
  }
  return out
}

/** The page: each section's lines in the writer's order. */
export function townNewsPage(rows) {
  const page = Object.fromEntries(NEWS_SECTIONS.map((k) => [k, []]))
  for (const r of [...(rows ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))) page[r.section]?.push(r)
  return page
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
  const live = (rows ?? []).filter((o) => !CALENDAR_KINDS.includes(o.kind) && ['new', 'offered', 'saved'].includes(o.status ?? 'new') && (!o.when || (o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 14))))
  const dated = live.filter((o) => o.when).sort((a, b) => a.when.localeCompare(b.when)).slice(0, 7)
  const weekly = live.filter((o) => !o.when && o.kind !== 'restaurant').slice(0, 3)
  const places = live.filter((o) => o.kind === 'restaurant').sort((a, b) => Number(b.status === 'saved') - Number(a.status === 'saved') || Number(b.gem) - Number(a.gem) || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5)
  const all = [...dated, ...weekly, ...places]
  if (!all.length) return null
  const line = (o) => `- ${o.kind}: ${o.title}${o.when ? ` · ${o.when}` : o.recurring ? ` · ${o.recurring}` : ''}${o.place && o.place !== o.title ? ` · ${o.place}` : ''}${o.drive_min ? ` · ~${o.drive_min} min` : ''}${o.rating ? ` · ${o.rating}★ (${o.rating_count})` : ''}${o.gem ? ' · hidden gem' : ''}${o.free ? ' · free' : ''}${o.status === 'saved' ? ' · they saved it' : ''}${o.why ? ` — ${o.why}` : ''}`
  return `OUT AND ABOUT (the Scout's list: checked this week as real, on, and within half an hour of home): when they ask for something to do, a date night, a new restaurant or a workout (yoga, pilates, run club, pickleball), suggest from these — two to four, each with when and where, leaning to the two of them unless the kids are asked about. Never suggest a place or event that isn't here unless search_web finds it right now, and never one they've said no to. "Put it on the calendar" is create_event.\n${all.map(line).join('\n')}`
}

// ── The calendars (Jake, Oct 8: "do the calendar feeds" — live music, comedy, trivia; "local first") ──────────────
// Read straight from each calendar's own markup, no AI: Weekend Broward's Palm Beach County gigs (today's, every
// morning), South Florida Live Music's gig list (weeks ahead, weekly residencies, ticketed shows), Great Big Trivia's
// weekly games. They're the source, so a listing is taken on their word.
export const CALENDAR_KINDS = ['music', 'comedy', 'trivia']
export const CALENDARS = [
  { id: 'weekendbroward', name: 'Weekend Broward', url: 'https://weekendbroward.com/live-music-calendar-palm-beach-county/' },
  { id: 'sflm', name: 'South Florida Live Music', url: 'https://southfloridalivemusic.com/gigs-calendar/' },
  { id: 'greatbigtrivia', name: 'Great Big Trivia', url: 'https://www.greatbigtrivia.com/play/palm-beach-county' },
]

const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&#0?39;|&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#8211;/g, '–').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim()
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
const clock = (t) => { const [h, m] = String(t).split(':').map(Number); return { h, m, text: `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, pm: h >= 12 } }

/** Great Big Trivia: its weekly games (schema.org EventSeries in the page's JSON-LD). */
export function parseTriviaSchedule(html, url) {
  const out = []
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk)
    if (!o || typeof o !== 'object') return
    if (o['@type'] === 'EventSeries' && o.name && o.eventSchedule) {
      const day = String(o.eventSchedule.byDay ?? '').split('/').pop()
      const a = clock(o.eventSchedule.startTime ?? '19:00')
      const b = o.eventSchedule.endTime ? clock(o.eventSchedule.endTime) : null
      const range = b ? (a.pm === b.pm ? `${a.text}–${b.text} ${b.pm ? 'PM' : 'AM'}` : `${a.text} ${a.pm ? 'PM' : 'AM'}–${b.text} ${b.pm ? 'PM' : 'AM'}`) : `${a.text} ${a.pm ? 'PM' : 'AM'}`
      const addr = o.location?.address ?? {}
      out.push({
        kind: 'trivia', title: decode(o.name).replace(/\s+at\s+.*$/i, ''), when: null, recurring: day ? `${day}s ${range}` : null,
        place: decode(o.location?.name) || null, address: [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ') || null,
        url, why: /bingo/i.test(o.name) ? 'free music bingo, real bar prizes' : 'free team trivia, real bar prizes', free: o.isAccessibleForFree === true ? true : null,
      })
    }
    Object.values(o).forEach(walk)
  }
  for (const m of String(html).matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])) } catch { /* a broken block: the rest still count */ }
  }
  return out
}

/** Weekend Broward: the day's Palm Beach County gigs (Simple Calendar's schema.org Event markup). */
export function parseWeekendBroward(html) {
  const out = []
  for (const li of String(html).match(/<li class="simcal-event[\s\S]*?<\/li>/g) ?? []) {
    const name = decode(li.match(/simcal-event-title"[^>]*>([^<]*)/)?.[1]).replace(/[\s+*]+$/, '')
    const start = li.match(/itemprop="startDate" content="(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
    if (!name || !start) continue
    const where = decode(li.match(/itemprop="address" content="([^"]*)"/)?.[1]).replace(/,\s*USA$/, '')
    const parts = where ? where.split(/,\s*/) : []
    const venueFirst = parts.length > 1 && !/^\d/.test(parts[0])
    const desc = li.match(/simcal-event-description[\s\S]*$/)?.[0] ?? ''
    const why = decode(desc.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '')) || decode(desc.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, '')).slice(0, 80) || null
    out.push({
      kind: /comedy|comedian|stand-?up/i.test(name + why) ? 'comedy' : 'music', title: name.split(/\s+at\s+/i)[0],
      when: `${start[1]} ${start[2]}:${start[3]}`, recurring: null,
      place: venueFirst ? parts[0] : (name.split(/\s+at\s+/i)[1]?.replace(/\s+in\s+[^,]+$/i, '') ?? null),
      address: (venueFirst ? parts.slice(1) : parts).join(', ') || null,
      url: desc.match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? null, why: why && !/^more info/i.test(why) ? why : null, free: null,
    })
  }
  return out
}

const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** South Florida Live Music: its gigs (the page's own gig list: act, venue, when, genre, cover, the venue's spot). */
export function parseSflmGigs(html, today) {
  const out = []
  const seen = new Set()
  for (const m of String(html).match(/\{"slug":"[^{}]*?"detailUrl":"[^"]*"\}/g) ?? []) {
    let g
    try { g = JSON.parse(m) } catch { continue }
    if (seen.has(g.slug)) continue
    seen.add(g.slug)
    const time = decode(g.time)
    let when = null
    let recurring = null
    const d = time.match(/^[A-Za-z]{3},\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s*·\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?/i)
    if (d) {
      const mo = MONTHS3.indexOf(d[1].toLowerCase()) + 1
      const year = Number(today.slice(0, 4))
      const md = `${String(mo).padStart(2, '0')}-${d[2].padStart(2, '0')}`
      const day = `${year}-${md}` < addDays(today, -30) ? `${year + 1}-${md}` : `${year}-${md}`
      when = d[3] ? `${day} ${hhmm((Number(d[3]) % 12) + (/pm/i.test(d[5]) ? 12 : 0), Number(d[4] ?? 0))}` : day
    } else if (/^tonight/i.test(time)) when = today
    else if (/^tomorrow/i.test(time)) when = addDays(today, 1)
    else if (/^every/i.test(time)) recurring = time
    else continue
    const venue = decode(g.venue)
    const comedy = /comedy|stand-?up/i.test(g.genre ?? '')
    const lat = Number(g.lat)
    const lng = Number(g.lng)
    out.push({
      kind: comedy ? 'comedy' : 'music', title: decode(g.artist).replace(/\s+·\s+/g, ' & ').replace(new RegExp(`\\s+at\\s+${venue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i'), ''),
      when, recurring, place: venue || null, address: null, url: g.detailUrl ?? null,
      why: [String(g.genre ?? '').toLowerCase(), g.cover ? String(g.cover).toLowerCase() : null].filter(Boolean).join(' · ') || null,
      free: /^(free|no cover)$/i.test(g.cover ?? '') ? true : /ticket/i.test(g.cover ?? '') ? false : null,
      ticketed: /ticket/i.test(g.cover ?? ''), at: Number.isFinite(lat) && Number.isFinite(lng) && lat ? { lat, lng } : null,
    })
  }
  return out
}

/** Karaoke and DJ nights: on the gig calendars, but not the live music asked for (Jake: "bands … live music"). */
export function notLiveMusic(o) {
  if (o.kind !== 'music') return false
  return /\bkaraoke\b|\bdj\b|\bdjs\b|\bdj sets?\b|\btechno\b|\bedm\b|open format/i.test(`${o.title ?? ''} ${o.why ?? ''}`)
}

// Drive time for the calendars: town streets near home, then the interstate further out.
const roadMinutes = (km) => Math.round(km < 15 ? km / 0.75 + 4 : 24 + (km - 15) / 1.25)
const HOUR_TOWNS = ['boca raton', 'deerfield', 'pompano', 'fort lauderdale', 'ft. lauderdale', 'hollywood', 'sunrise', 'coral springs', 'coconut creek', 'margate', 'parkland', 'stuart', 'hobe sound', 'jensen beach', 'palm city', 'port st']
/**
 * Local first (Jake, Oct 8): an everyday thing — a bar band, trivia — within about 35 minutes; a ticketed show (a
 * touring band, a comedian) up to about an hour (Boca, Fort Lauderdale; never Miami).
 */
export function calendarReach(item, home) {
  if (item.at && home) {
    const minutes = roadMinutes(haversineKm(home, item.at))
    return minutes <= 35 || (item.ticketed && minutes <= 70) ? { ok: true, minutes } : { ok: false, note: `about ${minutes} min` }
  }
  const t = `${item.address ?? ''} ${item.place ?? ''}`.toLowerCase()
  if (HOUR_TOWNS.some((x) => t.includes(x))) return item.ticketed ? { ok: true, minutes: null } : { ok: false, note: 'about 40+ min' }
  if (NEAR.some((x) => t.includes(x))) return { ok: true, minutes: null }
  return { ok: false, note: 'no town in reach' }
}

/**
 * Not for this family (Jake, Oct 8: "the last thing I want to hear about is typical tourist stuff / referral bait"):
 * sightseeing and tours for visitors, packages, giveaways, promo codes, sponsored picks and "top 10" lists.
 */
export function isBait(o) {
  const t = `${o.title ?? ''} ${o.why ?? ''} ${o.place ?? ''}`.toLowerCase()
  return /\b(sightseeing|boat tours?|trolley tours?|duck tours?|airboats?|hop[- ]on|segway tours?|bus tours?|souvenirs?|tourists?|vacation packages?|hotel packages?|resort packages?|stay(cation)? packages?|timeshares?|sweepstakes|giveaways?|enter (now|to win)|win (\d+|a|an|two|vip|free)\b|promo codes?|discount codes?|use code|coupons?|groupon|affiliate|sponsored|top \d+|best things to do|bucket list|must[- ]see)\b/.test(t)
}

// ── One thing, however many sources say it (Jake, Oct 8: "we will need some significant deduping") ────────────
const FILLER = new Set(['live', 'music', 'band', 'bands', 'duo', 'trio', 'weekly', 'every', 'rotating', 'local', 'featuring', 'feat', 'presents', 'show', 'tonight', 'night', 'nights', 'free', 'with'])
const sig = (t) => new Set(words(t).filter((w) => !FILLER.has(w)))
const DAY_WORDS = [/\bsun(day)?s?\b/, /\bmon(day)?s?\b/, /\btue(s|sday)?s?\b/, /\bwed(nesday)?s?\b/, /\bthu(r|rs|rsday)?s?\b/, /\bfri(day)?s?\b/, /\bsat(urday)?s?\b/]
const weekdaysOf = (text) => DAY_WORDS.map((re, i) => (re.test(String(text ?? '').toLowerCase()) ? i : -1)).filter((i) => i >= 0)
const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
const minutesOf = (when) => (when && when.length > 10 ? Number(when.slice(11, 13)) * 60 + Number(when.slice(14, 16)) : null)

/** Whether two outings are the same thing: the same day (or week day), the same act or name, the same place. */
export function sameOuting(a, b) {
  const ra = a.kind === 'restaurant'
  const rb = b.kind === 'restaurant'
  if (ra !== rb) return false
  const va = sig(a.place)
  const vb = sig(b.place)
  if (ra) {
    const x = sig(a.place ?? a.title)
    const y = sig(b.place ?? b.title)
    return [...x].filter((w) => y.has(w)).length >= Math.max(1, Math.min(x.size, y.size))
  }
  // The day.
  let sameTime = false
  if (a.when && b.when) {
    if (a.when.slice(0, 10) !== b.when.slice(0, 10)) return false
    const ma = minutesOf(a.when)
    const mb = minutesOf(b.when)
    if (ma !== null && mb !== null && Math.abs(ma - mb) > 120) return false
    sameTime = ma !== null && ma === mb
  } else if (a.when || b.when) {
    const dated = a.when ? a : b
    const weekly = a.when ? b : a
    if (!weekdaysOf(weekly.recurring).includes(weekdayOf(dated.when.slice(0, 10)))) return false
  } else {
    const da = weekdaysOf(a.recurring)
    const db = weekdaysOf(b.recurring)
    if (da.length && db.length && !da.some((d) => db.includes(d))) return false
  }
  // The place: different named places are different things — unless it's the same act at the same minute.
  const venueOverlap = [...va].some((w) => vb.has(w))
  const venuesDiffer = va.size > 0 && vb.size > 0 && !venueOverlap
  // The name, without the place's words.
  const ta = new Set([...sig(a.title)].filter((w) => !va.has(w) && !vb.has(w)))
  const tb = new Set([...sig(b.title)].filter((w) => !va.has(w) && !vb.has(w)))
  if (!ta.size || !tb.size) return venueOverlap && !ta.size && !tb.size
  const shared = [...ta].filter((w) => tb.has(w)).length
  const named = shared >= Math.min(ta.size, tb.size) || shared / new Set([...ta, ...tb]).size >= 0.5
  if (!named) return false
  return !venuesDiffer || sameTime
}

/** The two as one: the kept one's name, key and answer; the fuller details from either; where each was seen. */
function mergeOuting(kept, more) {
  const notes = [...new Set([kept.verify_note, more.verify_note].filter(Boolean).flatMap((n) => n.split(' · ')))]
  const min = [kept.drive_min, more.drive_min].filter((x) => typeof x === 'number')
  return {
    ...kept,
    when: (kept.when?.length ?? 0) >= (more.when?.length ?? 0) ? kept.when ?? more.when : more.when,
    recurring: kept.recurring ?? more.recurring ?? null,
    place: kept.place ?? more.place ?? null, address: kept.address ?? more.address ?? null, url: kept.url ?? more.url ?? null,
    why: kept.why ?? more.why ?? null, free: kept.free ?? more.free ?? null,
    drive_min: min.length ? Math.min(...min) : null,
    verify_note: notes.join(' · ') || null,
  }
}

/**
 * Today's finds folded into what's kept: one that matches a kept outing (any source, any wording) updates that row —
 * its key, its status, what the family said of it stay; one said no to stays gone; the rest merge among themselves
 * and come in new. The rows to write.
 */
export function foldIn(incoming, existing) {
  const pool = (existing ?? []).map((r) => ({ ...r }))
  const touched = new Set()
  const fresh = []
  for (const c of incoming ?? []) {
    const key = c.dedupe_key ?? dedupeKey(c)
    const hit = pool.find((r) => r.dedupe_key === key || sameOuting(r, c))
    if (hit) {
      if (hit.status === 'not_for_us') continue
      Object.assign(hit, mergeOuting(hit, c))
      touched.add(hit)
      continue
    }
    const mine = fresh.find((r) => r.dedupe_key === key || sameOuting(r, c))
    if (mine) Object.assign(mine, mergeOuting(mine, c))
    else fresh.push({ ...c, dedupe_key: key })
  }
  return [...touched, ...fresh]
}

/**
 * Alexa's live music, comedy and trivia (Jake, Oct 8: "live music would be cool … comedians, bands, music, even
 * trivia … local first"): from the calendars — tonight first, then the next week day by day, then the weekly ones (trivia
 * nights, house bands) by day. Null with none.
 */
export function tonightSection(rows, today) {
  // Anything a calendar lists, whatever it was first kept as (Clematis by Night's band merged into the Scout's own row).
  const listed = (o) => CALENDAR_KINDS.includes(o.kind) || CALENDARS.some((c) => (o.verify_note ?? '').includes(`on ${c.name}`))
  const live = (rows ?? []).filter((o) => listed(o) && o.kind !== 'restaurant' && ['new', 'offered', 'saved'].includes(o.status ?? 'new'))
  const time = (w) => (w.length > 10 ? outingWhen({ when: w }).split(' · ')[1] : null)
  const at = (o) => `${o.title}${o.place && o.place !== o.title ? ` at ${o.place}` : ''}${o.drive_min ? ` (~${o.drive_min} min)` : ''}${o.why ? ` — ${o.why}` : ''}${o.status === 'saved' ? ' · they saved it' : ''}`
  const kind = (o) => (CALENDAR_KINDS.includes(o.kind) && o.kind !== 'music' ? `${o.kind}: ` : '')
  const dated = live.filter((o) => o.when && o.when.slice(0, 10) >= today && o.when.slice(0, 10) <= addDays(today, 7)).sort((a, b) => a.when.localeCompare(b.when))
  const tonight = dated.filter((o) => o.when.slice(0, 10) === today).slice(0, 14)
  const week = dated.filter((o) => o.when.slice(0, 10) !== today).slice(0, 24)
  const weekly = live.filter((o) => !o.when && o.recurring).sort((a, b) => (weekdaysOf(a.recurring)[0] ?? 7) - (weekdaysOf(b.recurring)[0] ?? 7)).slice(0, 24)
  if (!tonight.length && !week.length && !weekly.length) return null
  const day = (w) => outingWhen({ when: w }).replace(/^(\w+), /, '$1 ')
  return [
    'LIVE MUSIC, COMEDY & TRIVIA (read this morning from local gig and trivia calendars — bars, restaurants and venues within about half an hour; ticketed shows up to an hour): for "who\'s playing tonight", "live music", "a band", "comedy", "trivia", answer from these, local first, two to four with when and where. Nothing that isn\'t here unless search_web finds it right now.',
    ...(tonight.length ? [`Tonight (${today}):`, ...tonight.map((o) => `- ${time(o.when) ? `${time(o.when)} · ` : ''}${kind(o)}${at(o)}`)] : []),
    ...(week.length ? ['The next week:', ...week.map((o) => `- ${kind(o)}${day(o.when)} · ${at(o)}`)] : []),
    ...(weekly.length ? ['Every week:', ...weekly.map((o) => `- ${kind(o)}${o.recurring} · ${at(o)}`)] : []),
  ].join('\n')
}
