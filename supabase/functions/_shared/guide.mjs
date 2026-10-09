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

// ---- Step 2: the buzz (canvas 85B). Places worth trying, found on Google by what they love, checked (open, in reach,
// well liked, not a national chain), with what locals and the local press say and how fast the reviews are coming. ----

/** The shelves: a love in Your taste turns its shelf on (a love of their own is searched as they wrote it). */
export const GUIDE_SHELVES = [
  { id: 'oysters', label: 'Oysters & raw bars', match: /oyster|raw bar|seafood/i, queries: ['oyster bar'] },
  { id: 'bars', label: 'Neighborhood bars', match: /neighbou?rhood bar|dive|pub|cocktail/i, queries: ['neighborhood bar', 'cocktail bar'] },
  { id: 'gameday', label: 'Game-day bars', match: /game|sports|football/i, queries: ['sports bar'] },
  { id: 'trivia', label: 'Trivia nights', match: /trivia|quiz/i, queries: ['bar trivia night'] },
  { id: 'hotel', label: 'Boutique hotel bars', match: /hotel/i, queries: ['boutique hotel bar'] },
  { id: 'vintage', label: 'Vintage', match: /vintage|thrift|antique/i, queries: ['vintage store'] },
  { id: 'spooky', label: 'Ghost tours', match: /ghost|haunt|spooky/i, queries: ['ghost tour'] },
  { id: 'escape', label: 'Escape rooms', match: /escape/i, queries: ['escape room'] },
]
/** Where to look: home's side of the county and the towns a date night reaches; Fort Lauderdale for something special. */
export const GUIDE_AREAS = [
  { id: 'north', name: 'Jupiter and the Gardens', lat: 26.86, lng: -80.08 },
  { id: 'home', name: 'West Palm and Lake Worth', lat: null, lng: null },
  { id: 'delray', name: 'Delray and Boynton', lat: 26.49, lng: -80.07 },
  { id: 'boca', name: 'Boca', lat: 26.36, lng: -80.09 },
  { id: 'ftl', name: 'Fort Lauderdale', lat: 26.12, lng: -80.14 },
]
/** National chains: never a local's pick. */
const CHAIN = /\b(hooters|buffalo wild wings|twin peaks|applebee'?s|chili'?s|bonefish|red lobster|tgi friday'?s|dave (&|and) buster'?s|yard house|bar louie|world of beer|walk-?on'?s|miller'?s ale house|bj'?s|cheesecake factory|outback|olive garden|texas roadhouse|starbucks|goodwill|salvation army|savers|plato'?s closet|uptown cheapskate|tilted kilt|ruth'?s chris|seasons 52|kona grill)\b/i

/** The shelves to search for this taste, each with its queries; a love that matches no shelf is a shelf of its own. */
export function guideShelves(taste) {
  const loves = [...(taste?.loves ?? []), ...(taste?.tryFirst ?? [])]
  const on = GUIDE_SHELVES.filter((s) => loves.some((l) => s.match.test(l)))
  const own = loves.filter((l) => !GUIDE_SHELVES.some((s) => s.match.test(l)))
    .map((l) => ({ id: `own:${l.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: l, match: null, queries: [l] }))
  return [...on, ...own]
}

/** Minutes by car from home, from the straight line: town streets for the first few miles, then I-95. */
export function guideDriveMin(home, loc) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(loc.lat - home.lat) / 2) ** 2 + Math.cos(rad(home.lat)) * Math.cos(rad(loc.lat)) * Math.sin(rad(loc.lng - home.lng) / 2) ** 2
  const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.15
  return Math.round(6 + (Math.min(km, 9) / 40 + Math.max(0, km - 9) / 110) * 60)
}

/** A Google place, checked: open, liked, not a chain, and within reach (a bit past it only if it earns a label later). */
export function placeVerdict(p, home, reachMin = 45) {
  if (!p || p.businessStatus !== 'OPERATIONAL') return { ok: false, note: 'not open' }
  const name = String(p.displayName?.text ?? '')
  if (!name || CHAIN.test(name)) return { ok: false, note: 'a chain' }
  const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null
  if (!loc || !home) return { ok: false, note: 'no location' }
  const minutes = guideDriveMin(home, loc)
  if (minutes > reachMin + 20) return { ok: false, note: `about ${minutes} min away` }
  const rating = Number(p.rating ?? 0)
  const count = Number(p.userRatingCount ?? 0)
  if (rating < 4.2 || count < 20) return { ok: false, note: `${rating} from ${count}` }
  return { ok: true, minutes, beyond: minutes > reachMin }
}

/** "The Blind Monk" and "Blind Monk WPB" are one place. */
export function sameName(a, b) {
  const n = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[’'`]/g, '').replace(/\b(the|wpb|west palm( beach)?|bar|restaurant|and grill|grill|fl)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const x = n(a)
  const y = n(b)
  if (!x || !y) return false
  return x === y || (x.length >= 5 && y.startsWith(x)) || (y.length >= 5 && x.startsWith(y))
}

/** One grounded search a shelf: what locals and the local press recommend, and what's new and talked about. */
export function buzzPrompt(shelf, today) {
  return `Search the web now (today is ${today}). Which ${shelf.label.toLowerCase()} places in Palm Beach County and Fort Lauderdale, Florida do LOCALS recommend — on Reddit (r/WestPalmBeach, r/fortlauderdale, r/boca, r/Delraybeach, r/southflorida), in the local press (Palm Beach Post, New Times Broward-Palm Beach, Eater Miami, The Infatuation, Palm Beach Illustrated, Sun Sentinel, Boca Magazine) and local newsletters? Include ones that are new and getting talked about. Leave out tourist traps and national chains.
For each place: "name" (as the place calls itself), "town", "said" — what the sources say about it, in under 20 words, only what they actually say (no praise of your own), "kind" — "reddit" if Reddit is where you found it, else "press", "new" — true only if a source says it opened in the last few months.
Up to 12 places, the most talked about first. Answer with only a JSON array: [{"name": "...", "town": "...", "said": "...", "kind": "reddit" | "press", "new": false}]`
}

/** The search's answer, only well-formed places, once each. */
export function parseBuzz(text) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out = []
  for (const b of arr) {
    const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 80) : ''
    if (!name || out.some((o) => sameName(o.name, name))) continue
    out.push({
      name,
      town: typeof b.town === 'string' ? b.town.trim().slice(0, 40) : null,
      said: typeof b.said === 'string' && b.said.trim() ? b.said.trim().replace(/\s+/g, ' ').slice(0, 160) : null,
      kind: b.kind === 'reddit' ? 'reddit' : 'press',
      new: b.new === true,
    })
  }
  return out.slice(0, 12)
}

/** How fast the reviews are coming, from the weekly counts (Google's terms: a month at most is kept). */
export function reviewTrend(snaps, now = new Date()) {
  const recent = (snaps ?? []).filter((s) => now.getTime() - Date.parse(s.seen_on) <= 31 * 86_400_000).sort((a, b) => Date.parse(a.seen_on) - Date.parse(b.seen_on))
  if (recent.length < 2) return null
  const first = recent[0]
  const last = recent[recent.length - 1]
  const days = Math.round((Date.parse(last.seen_on) - Date.parse(first.seen_on)) / 86_400_000)
  if (days < 6 || !first.rating_count) return null
  const added = last.rating_count - first.rating_count
  return { added, growth: added / first.rating_count, days }
}

/**
 * The labels a place has earned — only on evidence: Locals' favorite (talked up on Reddit, or by two local sources,
 * and well liked), Hot right now (reviews coming fast this month, or new and talked about), Hidden gem (loved by the
 * few who've found it, and not touristy). Past the usual drive only with one of these.
 */
export function guideLabels(p, { buzz = [], trend = null } = {}) {
  const labels = []
  const rating = Number(p.rating ?? 0)
  const count = Number(p.rating_count ?? 0)
  const reddit = buzz.some((b) => b.kind === 'reddit')
  if (!p.touristy && rating >= 4.3 && (reddit || buzz.length >= 2)) labels.push('local')
  // "New" from a source counts only for a place that's young on Google (a thousand reviews isn't new).
  if ((trend && trend.growth >= 0.12 && trend.added >= 15) || (buzz.some((b) => b.new) && count < 400)) labels.push('hot')
  if (!p.touristy && rating >= 4.6 && count >= 25 && count <= 250 && !labels.includes('local')) labels.push('gem')
  return labels
}

/** What the guide heard, in one line — only what the evidence says. */
export function heardLine(p, { buzz = [], trend = null } = {}) {
  const parts = []
  const where = [...new Set(buzz.map((b) => (b.kind === 'reddit' ? 'on Reddit' : 'in the local press')))]
  if (where.length) parts.push(`Talked up ${where.join(' and ')}`)
  if (trend && trend.added > 0 && trend.growth >= 0.05) parts.push(`${trend.added} new Google reviews in ${trend.days} days`)
  parts.push(`${Number(p.rating).toFixed(1)} from ${p.rating_count} Google reviews`)
  const said = buzz.find((b) => b.said)?.said
  const quote = said ? said.replace(/[.\s]+$/, '') : ''
  return `${parts.join(' · ')}.${quote ? ` ${quote[0].toUpperCase()}${quote.slice(1)}.` : ''}`
}

/** Best first: earned labels, then what locals say, then how well liked (a big name's crowd counts for less). */
export function guideScore(p) {
  const labels = p.labels ?? []
  return (labels.includes('local') ? 3 : 0) + (labels.includes('hot') ? 2.5 : 0) + (labels.includes('gem') ? 2 : 0)
    + Math.min(2, (p.mentions ?? 0) * 0.7) + (Number(p.rating ?? 0) - 4) * 2 - (p.touristy ? 3 : 0) - (p.beyond ? 1 : 0)
}

/** The AI's look at a batch: touristy or not, still the shelf's kind of place, and why the two of them might like it. */
export function curatePrompt(places, taste) {
  const loves = [...(taste?.loves ?? []), ...(taste?.places ?? []).map((p) => p.name)].join(', ')
  const list = places.map((p, i) => `${i}. ${p.name} — ${p.shelf_label}; ${p.address ?? ''}; ${p.types ?? ''}; ${p.rating} from ${p.rating_count} reviews${p.said ? `; locals say: ${p.said}` : ''}`).join('\n')
  return `You're a South Florida local helping a couple in their 40s in West Palm Beach find date-night places. They love: ${loves}.
For each place below answer:
"keep" — false if it isn't really this kind of place (a restaurant listed as a "vintage store", a hotel with no bar to speak of, a kids' arcade as a "sports bar"), else true;
"touristy" — true if it mostly draws tourists or cruise and vacation crowds rather than locals (a beach strip spot, a big attraction), else false;
"why" — why it suits these two, under 14 words, plain and warm, about them and what they love ("A wine bar for a slow date night"). Don't repeat what locals say, don't compare it to the places they love ("like Blue Door"), and add no facts beyond what's given (no dishes, prices or hours you weren't told).
Answer with only a JSON array, one per place, by its number: [{"i": 0, "keep": true, "touristy": false, "why": "..."}]

${list}`
}

/** The AI's answer by number; a place it didn't answer is kept as it was (not touristy, no why). */
export function parseCurate(text, count) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  const out = new Map()
  if (start < 0 || end <= start) return out
  let arr
  try { arr = JSON.parse(s.slice(start, end + 1)) } catch { return out }
  if (!Array.isArray(arr)) return out
  for (const a of arr) {
    if (!Number.isInteger(a?.i) || a.i < 0 || a.i >= count || out.has(a.i)) continue
    out.set(a.i, { keep: a.keep !== false, touristy: a.touristy === true, why: typeof a.why === 'string' && a.why.trim() ? a.why.trim().slice(0, 120) : null })
  }
  return out
}

/** Places worth trying for the page (85B): by shelf in the guide's order, the best few of each, then "+N more". */
export function placesByShelf(places, each = 3) {
  // What they shared themselves first (Send to Tabor House), then the guide's shelves in order.
  const order = ['shared', ...GUIDE_SHELVES.map((s) => s.id)]
  const shelves = new Map()
  for (const p of places ?? []) {
    if (p.status === 'not_for_us') continue
    if (!shelves.has(p.shelf)) shelves.set(p.shelf, { shelf: p.shelf, label: p.shelf_label, places: [] })
    shelves.get(p.shelf).places.push(p)
  }
  const all = [...shelves.values()].sort((a, b) => (order.indexOf(a.shelf) + 1 || 99) - (order.indexOf(b.shelf) + 1 || 99))
  const total = all.reduce((n, s) => n + s.places.length, 0)
  const shown = all.map((s) => ({ ...s, places: s.places.slice(0, each) }))
  return { shown, more: total - shown.reduce((n, s) => n + s.places.length, 0), total }
}

/** "2141 S Federal Hwy, Delray Beach, FL 33483, USA" → "Delray Beach". */
export function townOf(address) {
  const parts = String(address ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const i = parts.findIndex((s) => /^(FL|Florida)\b/.test(s))
  return i > 0 ? parts[i - 1] : parts.length >= 3 ? parts[parts.length - 3] : null
}
