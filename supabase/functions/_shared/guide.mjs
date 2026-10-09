// The local guide (Jake, Oct 9, canvas 85): Out & about as a South Florida local who knows what's good for the two of
// them — date nights, oysters, game-day bars, trivia, vintage, boutique hotels, ghost tours. It learns from them: the
// morning after an outing on the calendar, Alexa asks "How was it?" in Something for you (85C on the wall, 85D on the
// phone), each parent on their own. Pure helpers, shared by the scout function and the app.

/** What stood out: tapped, not typed (the wall has no keyboard to hand). Good things first, then the gripes. */
export const STAND_OUT = [
  ['food', 'The food'], ['drinks', 'The drinks'], ['vibe', 'The vibe'], ['music', 'The music'], ['service', 'The service'], ['view', 'The view'],
  ['loud', 'Too loud'], ['pricey', 'Too pricey'], ['crowded', 'Too crowded'], ['slow', 'Slow service'],
]
export const GO_BACK = [['soon', 'Yes, soon'], ['someday', 'Someday'], ['once', 'Once was enough']]
/** How many days after an outing it's still worth asking (a week: the wall isn't always walked past). */
export const ASK_DAYS = 7

// Not an outing: the runs, the routine, the appointments and the errands — a calendar is mostly these.
const NOT_AN_OUTING = /\b(drop[ -]?offs?|pick[ -]?ups?|pickup|school|practices?|gym|workouts?|work out|yoga|pilates|fitness|tutor\w*|lessons?|class(es)?|meetings?|conference|appointments?|orthodont\w*|dentist|doctors?|dr\.?|clinic|hospital|salon|haircut|groom\w*|vet|delivery|install\w*|repairs?|quotes?|flight|airport|strings|violin|piano|batting|softball|baseball|soccer|assessment|field trip|showcase|recital|rehearsal|tryouts?|errands?|walgreens|cvs|publix|costco|dmv|bank|watches|stay with)\b/i
// Someone's home is a visit, not a place to rate.
const A_HOME = /\b(home|house|apartment|condo|residence)\b|['’]s place\b/i

const street = (s) => {
  const m = String(s ?? '').toLowerCase().match(/(\d+)\s+([a-z]+)/)
  return m ? `${m[1]} ${m[2]}` : null
}

/**
 * Yesterday's (and the day before's) calendar items that might be outings worth a "How was it?": somewhere public,
 * a parent went, and it isn't a run, a routine, an appointment or an errand. The AI looks once more (rateAskPrompt).
 * events: [{ id, title, start_time, all_day, event_type, status, location_name, address, leg_type, recurring,
 * members: [{ id, name, role }] }]
 */
export function rateCandidates(events, { home = null } = {}) {
  const homeStreet = street(home)
  const out = []
  for (const e of events ?? []) {
    if (!e || e.all_day || e.event_type === 'reminder' || e.leg_type || e.recurring) continue
    if (/cancel/i.test(`${e.status ?? ''} ${e.title ?? ''}`)) continue
    const place = String(e.location_name ?? '').trim()
    const address = String(e.address ?? '').trim()
    if (!place && !address) continue
    if (NOT_AN_OUTING.test(`${e.title ?? ''} ${place}`) || A_HOME.test(place)) continue
    if (homeStreet && (street(address) === homeStreet || street(place) === homeStreet)) continue
    const parents = (e.members ?? []).filter((m) => m?.role === 'parent')
    if (!parents.length) continue
    // "Lake Lytal Park, 3645 Lake Lytal Park, …" reads as its name.
    const name = place ? place.split(',')[0].trim() : address.split(',')[0].trim()
    out.push({ event_id: e.id, title: String(e.title ?? '').trim(), place: name, address: address || null, visited_at: e.start_time, members: parents.map((m) => ({ id: m.id, name: m.name })) })
  }
  return out
}

/** The AI's one look: which of these were a night or a day out somewhere worth rating. */
export function rateAskPrompt(candidates) {
  const list = candidates.map((c, i) => `${i}. "${c.title}" at ${c.place}${c.address ? ` (${c.address})` : ''}`).join('\n')
  return `These are items from a family's calendar from the last day or two. Which were a leisure outing at a public place that the parents might want to rate afterwards — a restaurant, bar, café, show, concert, game or watch party at a bar, market, museum, attraction, tour, hotel, festival, or a fun place they took the kids? Not errands, chores, volunteering or helping out, work, a kid's lesson or team, medical or beauty appointments, or a visit to someone's home.
Answer with only a JSON array of the numbers that qualify, e.g. [0, 3]. An empty array is fine.

${list}`
}

/** The numbers the AI kept, only ones that exist. */
export function parseRateAsk(text, count) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  return [...new Set(arr.filter((n) => Number.isInteger(n) && n >= 0 && n < count))]
}

/** The rows to ask: one per parent who went. */
export function rateRows(candidates, kept, now = new Date()) {
  return kept.flatMap((i) => candidates[i].members.map((m) => ({
    event_id: candidates[i].event_id,
    member_id: m.id,
    title: candidates[i].title,
    place: candidates[i].place,
    address: candidates[i].address,
    visited_at: candidates[i].visited_at,
    status: 'ask',
    ask_after: now.toISOString(),
  })))
}

/**
 * What to ask now, oldest outing first: still open, not put off, and from the last few days. With a member, only theirs
 * (the phone); without, anyone's (the wall), the wall naming whose it is.
 * rows: [{ id, event_id, member_id, title, place, visited_at, status, ask_after }]
 */
export function ratingsToAsk(rows, now, memberId = null) {
  const oldest = now.getTime() - ASK_DAYS * 86_400_000
  return (rows ?? [])
    .filter((r) => r.status === 'ask' && Date.parse(r.ask_after) <= now.getTime() && Date.parse(r.visited_at) >= oldest && Date.parse(r.visited_at) < now.getTime())
    .filter((r) => !memberId || r.member_id === memberId)
    .sort((a, b) => Date.parse(a.visited_at) - Date.parse(b.visited_at))
}

/** "Not now": ask again tomorrow at 7 AM. */
export function askAgainAt(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 7, 0)
  return d.toISOString()
}

/** "last night", "yesterday", "Tuesday" — when it was, as Alexa would say it. */
export function whenItWas(visitedAt, now) {
  const at = new Date(visitedAt)
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days <= 0) return at.getHours() >= 17 ? 'tonight' : 'today'
  if (days === 1) return at.getHours() >= 17 ? 'last night' : 'yesterday'
  return `on ${at.toLocaleDateString('en-US', { weekday: 'long' })}`
}

/** The settings value the guide reads (Settings › Your taste, canvas 85D). */
export const TASTE_KEY = 'guide_taste'
export const REACH_CHOICES = [[30, '30 min'], [45, '45 min'], [90, 'Anywhere']]
/** What Jake told the guide on Oct 9 — nothing more: they change it from there. */
export const DEFAULT_TASTE = {
  loves: ['Neighborhood bars', 'Oysters', 'Bar trivia', 'Game-day bars', 'Vintage shops', 'Boutique hotels', 'Ghost tours'],
  tryFirst: ['Escape rooms'],
  places: [{ name: 'Mr B’s' }, { name: 'Blind Monk' }, { name: 'French Grill', note: 'Northwood, West Palm' }, { name: 'Blue Door', note: 'West Palm' }],
  teams: ['Florida', 'Miami'],
  reachMin: 45,
}

/** A saved taste, whole: missing parts from the defaults, lists cleaned (trimmed, once each). */
export function tasteOf(saved) {
  const s = saved && typeof saved === 'object' ? saved : {}
  const list = (v, d) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))] : d)
  const places = Array.isArray(s.places)
    ? s.places.map((p) => ({ name: String(p?.name ?? '').trim(), ...(p?.note ? { note: String(p.note).trim() } : {}) })).filter((p) => p.name)
    : DEFAULT_TASTE.places
  return {
    loves: list(s.loves, DEFAULT_TASTE.loves),
    tryFirst: list(s.tryFirst, DEFAULT_TASTE.tryFirst),
    places,
    teams: list(s.teams, DEFAULT_TASTE.teams),
    reachMin: REACH_CHOICES.some(([m]) => m === s.reachMin) ? s.reachMin : DEFAULT_TASTE.reachMin,
  }
}
