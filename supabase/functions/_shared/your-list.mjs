// Out & about from your list (canvas 86C; Jake, Oct 9: "the list will be significantly slimmed down to stuff I
// purposely add … then we can track if any of them actually get on the calendar"). Sixteen on the page: four
// highlights (a card each) and twelve below (newspaper columns), soonest first; the rest wait in Saved for later.
// Where each comes from: the places they saved (To try) and love (Your spots), what they asked about, the kinds of nights
// they'd do again (watched for new dates), a few nights of their kind from the scout, and one surprise.

const DAY = 86_400_000
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export const LIST_SIZE = { highlights: 4, more: 12 }

/** Why it's on the page, in their words: the small tag over each one. */
export const LIST_TAGS = {
  try: 'On your list',
  spot: 'Your spot',
  asked: 'You asked about it',
  again: 'Again',
  family: 'With the kids',
  kelly: 'Kelly’s kind of night',
  jake: 'Jake’s kind of night',
}

const KIND_IS = { couple: 'For two', family: 'With the kids', fitness: 'Get moving', music: 'Live music', comedy: 'Comedy', trivia: 'Trivia', restaurant: 'A place to try' }

/** "6 PM", "8:30 PM" from "HH:MM"; null without one. */
export function clock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  if (!m) return null
  const h = Number(m[1])
  return `${h % 12 || 12}${m[2] === '00' ? '' : `:${m[2]}`} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "TONIGHT", "TOMORROW", "SAT", "SAT OCT 24": how near, in small capitals. */
export function dayWord(ymd, today) {
  if (ymd === today) return 'TONIGHT'
  if (ymd === addDays(today, 1)) return 'TOMORROW'
  const d = new Date(`${ymd}T12:00:00Z`)
  const wd = WEEKDAY[d.getUTCDay()]
  return ymd <= addDays(today, 6) ? wd : `${wd} ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`
}

const dateOf = (o) => (o?.when ? String(o.when).slice(0, 10) : null)
const timeOf = (o) => (o?.when && String(o.when).length > 10 ? String(o.when).slice(11, 16) : null)
const savedWord = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `SAVED ${MONTH[d.getMonth()]} ${d.getDate()}` : 'YOU SAVED IT' }

/** A place on their list, or the surprise. */
export function placeItem(p, { today, calendar = {}, surprise = false } = {}) {
  const tags = []
  if (surprise) tags.push(...(p.labels ?? []))
  else tags.push(p.status === 'spot' ? 'spot' : 'try')
  if (p.origin === 'asked') tags.push('asked')
  if (p.whose && p.whose !== 'us') tags.push(p.whose)
  const own = (p.buzz ?? []).find((b) => b?.kind === 'shared' && b.said)?.said
  const said = (p.buzz ?? []).find((b) => b?.kind !== 'shared' && b?.said)?.said
  const hit = calendar[p.id]
  const when = hit?.next ? `ON THE CALENDAR ${dayWord(hit.next, today)}`
    : surprise ? 'SURPRISE · NOT ON YOUR LIST'
    : p.status === 'spot' ? 'ANY NIGHT' : savedWord(p.saved_at)
  // Town and drive; the stars are in its details.
  const where = [p.address ? townOf(p.address) : null, p.drive_min ? `${p.drive_min} min` : null].filter(Boolean).join(' · ')
  return {
    key: `place:${p.id}`, type: 'place', id: p.id, tags: [...new Set(tags)],
    // What it is: the guide's shelf for its picks; Google's word for one they added ("public skating" filed Ice Works under bars).
    is: (p.origin && p.origin !== 'guide' && p.types) || p.shelf_label || null, when, title: p.name, where,
    heard: own ? `“${own.replace(/\.$/, '')}” — in your words.` : said ? said.charAt(0).toUpperCase() + said.slice(1) : p.heard ?? null,
    why: surprise ? 'Your one surprise this week. Save it or ✕.' : p.note ?? p.why ?? null,
    date: hit?.next ?? null, time: null, place: p, onCalendar: Boolean(hit?.next), lastCalendar: hit?.last ?? null,
  }
}

/** A dated night out: one they'd do again or asked about (a watch), or one of their kind from the scout. */
export function outingItem(o, { today, watch = null } = {}) {
  const tags = []
  if (watch) tags.push(watch.kind)
  const whose = watch?.whose ?? (o.kind === 'family' ? 'family' : 'us')
  if (whose !== 'us') tags.push(whose)
  const day = dateOf(o)
  const when = [day ? dayWord(day, today) : o.recurring ? String(o.recurring).toUpperCase() : null, clock(timeOf(o)), o.free ? 'FREE' : null].filter(Boolean).join(' · ')
  const act = o.act
  const why = watch?.note ?? (act?.standing === 'star' ? (act.of ? `A tribute to ${act.of}.` : 'A name you’d know.') : act?.standing === 'liked' && act.genre ? `${act.genre.charAt(0).toUpperCase()}${act.genre.slice(1)} — your kind of music.` : null)
  return {
    key: `outing:${o.id}`, type: 'outing', id: o.id, tags,
    is: watch ? watch.name : o.venue_kind === 'cover' && o.kind === 'music' ? 'Cover band' : KIND_IS[o.kind] ?? null,
    when, title: o.title, where: [o.place && o.place !== o.title ? o.place : null, o.drive_min ? `${o.drive_min} min` : null].filter(Boolean).join(' · '),
    heard: o.verify_note === UNCHECKED ? [o.why, 'Check the date on its page.'].filter(Boolean).join(' ') : o.why ?? null, why, date: day, time: timeOf(o), outing: o,
  }
}

/** Their list places matched to the calendar (a year back, two months on): when it's next on, and when they last went. */
export function calendarHits(places, events, today) {
  const core = (s) => String(s ?? '').toLowerCase().split(/\s[-–|]\s/)[0].replace(/&/g, ' and ').replace(/[’'`]/g, '')
    .replace(/\b(the|wpb|west palm( beach)?|palm beach|delray( beach)?|boca( raton)?|restaurant|bar and grill|and grill|fl)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
  const hits = {}
  for (const p of places ?? []) {
    const name = core(p.name)
    // One plain word ("The Park" → park) would find the wrong things; a name of its own (Loco) is fine.
    if (name.length < 4 || COMMON.test(name)) continue
    const re = new RegExp(`\\b${name.replace(/ /g, '\\s+')}\\b`)
    for (const e of events ?? []) {
      const text = `${e.title ?? ''} ${e.location_name ?? ''}`.toLowerCase().replace(/[’'`]/g, '')
      if (!re.test(text)) continue
      const day = String(e.start_time ?? '').slice(0, 10)
      if (!day) continue
      const h = (hits[p.id] ??= { next: null, last: null })
      if (day >= today) { if (!h.next || day < h.next) h.next = day } else if (!h.last || day > h.last) h.last = day
    }
  }
  return hits
}

/** Put on the list by them, not tapped from the guide's picks. */
const OWN = new Set(['shared', 'alexa', 'added', 'like', 'taste'])

const COMMON = /^(park|house|garden|kitchen|tavern|grill|cafe|club|lounge|pub|beach|market|marina|social|local|hotel|inn|bistro|taproom|brewery|oyster|oysters|tacos)$/

const sortKey = (it, today) => `${it.date ?? addDays(today, 2)} ${it.time ?? (it.type === 'place' ? '99:98' : '99:99')}`

/** The week's surprise: one of the guide's labeled picks they haven't put on their list, a different one each week. */
export function surprisePick(places, today) {
  const pool = (places ?? []).filter((p) => p.status === 'live' && (p.labels ?? []).length && !p.beyond).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8)
  if (!pool.length) return null
  const week = Math.floor(Date.parse(`${today}T12:00:00Z`) / (7 * DAY))
  return pool[week % pool.length]
}

/**
 * The page: { highlights (4), more (12), later (the rest, by name), counts }. places — guide_places (live, saved,
 * spot); outings — the scout's, each watch's with watch_id; watches — guide_watch rows; calendar — calendarHits().
 */
export function yourList({ places = [], outings = [], watches = [], today, nowTime = null, calendar = {} }) {
  const watchBy = new Map((watches ?? []).map((w) => [w.id, w]))
  const upcoming = (o) => { const d = dateOf(o); return d && (d > today || (d === today && (!nowTime || !timeOf(o) || timeOf(o) >= nowTime))) }
  // Dated nights they asked for or would do again: the next two of each watch on the page, the rest later.
  const perWatch = new Map()
  const watched = []
  // Nearby first: the same Candlelight shows play in West Palm and Fort Lauderdale (Oct 10) — Broward's wait.
  const broward = (o) => /\b(fort lauderdale|davie|hollywood|pompano|plantation|sunrise|coral springs|weston|miramar|pembroke|dania|lauderhill|tamarac|margate|coconut creek|parkland)\b/i.test(String(o.place ?? ''))
  for (const o of [...(outings ?? [])].filter((o) => o.watch_id && watchBy.has(o.watch_id) && upcoming(o) && o.status !== 'not_for_us').sort((a, b) => Number(broward(a)) - Number(broward(b)) || String(a.when).localeCompare(String(b.when)))) {
    const n = perWatch.get(o.watch_id) ?? 0
    perWatch.set(o.watch_id, n + 1)
    watched.push({ item: outingItem(o, { today, watch: watchBy.get(o.watch_id) }), extra: n >= 2 })
  }
  // A few nights of their kind from the scout: names they'd know, a cover band at a cover bar, a trivia night — soon.
  const soon = (o) => dateOf(o) <= addDays(today, 3)
  const scoutPool = (outings ?? []).filter((o) => !o.watch_id && upcoming(o) && o.status !== 'not_for_us')
  const stars = scoutPool.filter((o) => o.kind === 'music' && o.act?.standing === 'star' && dateOf(o) <= addDays(today, 7))
  const covers = scoutPool.filter((o) => o.kind === 'music' && o.venue_kind === 'cover' && o.act?.standing === 'liked' && soon(o))
  const trivia = scoutPool.filter((o) => o.kind === 'trivia' && soon(o))
  const byWhen = (a, b) => String(a.when).localeCompare(String(b.when))
  const kindOf = [...stars.sort(byWhen).slice(0, 1), ...covers.sort(byWhen).slice(0, 1), ...trivia.sort(byWhen).slice(0, 1)].map((o) => outingItem(o, { today }))
  // Their places: what they asked about first, then the newest saved, then their spots.
  const mine = (places ?? []).filter((p) => p.status === 'saved' || p.status === 'spot')
  // What they asked about, then what they put there themselves (shared, told Alexa, added), then the guide's picks they
  // saved, then their spots (Oct 10: twelve picks saved with a tap had pushed Loco and Mary Lou's off the page).
  const rank = (p) => (p.origin === 'asked' ? 0 : p.status === 'spot' ? 3 : OWN.has(p.origin) ? 1 : 2)
  mine.sort((a, b) => rank(a) - rank(b) || String(b.saved_at ?? '').localeCompare(String(a.saved_at ?? '')))
  const placeItems = mine.map((p) => placeItem(p, { today, calendar }))
  const surprise = surprisePick(places, today)
  const surpriseItem = surprise ? placeItem(surprise, { today, surprise: true }) : null

  // The four highlights: the soonest night they asked for or would do again (else one of their kind), the newest place
  // to try that isn't on the calendar, the next "again", and the surprise.
  const used = new Set()
  const take = (it) => { if (it && !used.has(it.key)) { used.add(it.key); return it } return null }
  const thisWeek = (it) => it.date && it.date <= addDays(today, 6)
  const nearest = [...watched.map((w) => w.item).filter(thisWeek), ...kindOf.filter(thisWeek)].sort((a, b) => sortKey(a, today).localeCompare(sortKey(b, today)))
  const highlights = [
    take(nearest[0]),
    take(placeItems.filter((p) => p.tags.includes('try') && !p.onCalendar).sort((a, b) => Number(OWN.has(b.place?.origin)) - Number(OWN.has(a.place?.origin)) || String(b.place?.saved_at ?? '').localeCompare(String(a.place?.saved_at ?? '')))[0]),
    take(watched.map((w) => w.item).find((it) => it.tags.includes('again') && !used.has(it.key))),
    take(surpriseItem),
  ].filter(Boolean)
  // Twelve below, soonest first: up to five dated in the next two weeks, two further out, places for the rest.
  const dated = [...watched.filter((w) => !w.extra).map((w) => w.item), ...kindOf].filter((it) => !used.has(it.key)).sort((a, b) => sortKey(a, today).localeCompare(sortKey(b, today)))
  const near = dated.filter((it) => it.date <= addDays(today, 14))
  const far = dated.filter((it) => it.date > addDays(today, 14))
  const pool = [...placeItems.filter((it) => !used.has(it.key))]
  // Fewer than four (no surprise, nothing this week): the next ones up.
  while (highlights.length < LIST_SIZE.highlights && (pool.length || near.length || far.length)) {
    const it = take(near.shift() ?? pool.shift() ?? far.shift())
    if (it) highlights.push(it)
  }
  const nearN = Math.min(5, near.length)
  const farN = Math.min(2, far.length)
  const placesN = Math.min(pool.length, LIST_SIZE.more - nearN - farN)
  let picked = [...near.slice(0, nearN), ...pool.slice(0, placesN), ...far.slice(0, farN)]
  // Short on places: more of the dated ones.
  const rest = [...near.slice(nearN), ...far.slice(farN), ...pool.slice(placesN)]
  while (picked.length < LIST_SIZE.more && rest.length) picked.push(rest.shift())
  picked.forEach((it) => used.add(it.key))
  const more = picked.sort((a, b) => sortKey(a, today).localeCompare(sortKey(b, today)))
  const later = [...rest, ...watched.filter((w) => w.extra).map((w) => w.item)].filter((it) => !used.has(it.key))
  return {
    highlights: highlights.filter(Boolean), more, later,
    counts: { places: mine.length, onCalendar: mine.filter((p) => calendar[p.id]?.next).length, later: later.length },
  }
}

/** "Stuart's haunted pub crawl, Candlelight: Queen and 6 more": what's waiting, in a line. */
export function laterLine(later, n = 4) {
  const names = [...new Set((later ?? []).map((it) => it.title))]
  if (!names.length) return null
  const shown = names.slice(0, n)
  return names.length > n ? `${shown.join(', ')} and ${names.length - n} more` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]
}

function townOf(address) {
  const parts = String(address ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const i = parts.findIndex((s) => /^(FL|Florida)\b/.test(s))
  return i > 0 ? parts[i - 1] : parts.length >= 3 ? parts[parts.length - 3] : null
}

// ---- Watching (canvas 86C; Jake: "we really liked the Violin Candlelight 90's Rap concert … when are they happening
// again in WPB"): a kind of night they'd do again, or asked about, looked for on the web — each date checked on its page. ----

/** How far ahead a watch looks: far enough to plan a December night in October. */
export const WATCH_DAYS = 150

/** One grounded search a watch: its upcoming dates near home, only ones a page shows. */
export function watchPrompt(watch, { today, until }) {
  return `Search the web now (today is ${today}). Find upcoming dated events for: ${watch.query}
Only in Palm Beach County or Broward County, Florida, from today through ${until}. Look on the organizer's or venue's own pages and ticket pages (Fever, Eventbrite, Ticketmaster, the Kravis Center, the venue's site).
For each date: "title" (as the page lists it), "date" (YYYY-MM-DD), "time" (24-hour HH:MM, or null), "venue", "town", "price_from" (a number in dollars, or null), "url" (the page that shows this date), "line" (what it is, under 18 words, only what the page says).
Only events you actually found with that date on a page — never guess a date. Up to 15, soonest first. Answer with only a JSON array: [{"title": "...", "date": "2026-10-24", "time": "18:30", "venue": "...", "town": "...", "price_from": 54, "url": "https://...", "line": "..."}]`
}

const jsonArray = (text) => {
  const m = /\[[\s\S]*\]/.exec(String(text ?? ''))
  if (!m) return []
  try { const v = JSON.parse(m[0]); return Array.isArray(v) ? v : [] } catch { return [] }
}
const clean = (v, n = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

/** The search's dates, kept only when they're whole: a title, a real date in the window, a page. */
export function parseWatchEvents(text, { today, until }) {
  const seen = new Set()
  return jsonArray(text).flatMap((e) => {
    const title = clean(e?.title, 140)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? '') ? e.date : null
    const url = /^https?:\/\//.test(e?.url ?? '') ? e.url : null
    if (!title || !date || !url || date < today || date > until || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return []
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(e?.time ?? '') ? e.time : null
    const key = `${title.toLowerCase()}|${date}|${time ?? ''}`
    if (seen.has(key)) return []
    seen.add(key)
    const price = Number(e?.price_from)
    return [{ title, date, time, venue: clean(e?.venue, 120), town: clean(e?.town, 60), price_from: Number.isFinite(price) && price > 0 ? Math.round(price) : null, url, line: clean(e?.line, 160) }]
  })
}

/** Past Broward is past a night out (Homestead's ghost tour, Oct 10): Miami-Dade and the rest of the state. */
export function watchTooFar(e) {
  return /\b(miami|homestead|cutler bay|kendall|hialeah|doral|coral gables|orlando|tampa|naples|fort myers|key west|key largo|vero beach|port st\.? lucie|sarasota|st\.? petersburg|jacksonville|gainesville|tallahassee)\b/i.test(`${e?.venue ?? ''} ${e?.town ?? ''}`)
}

/** Found by the search but its page wouldn't open to check (Fever, the Kravis — they block page readers): said so. */
export const UNCHECKED = 'found by search; its page wouldn’t open to check'

/**
 * One line a show (Oct 10: Ballet Palm Beach's Nutcracker came back as five performances, under two names): the first
 * date kept, the other days as also.
 */
export function collapseWatchDates(events) {
  const norm = (t) => String(t ?? '').toLowerCase().replace(/^[^-–]{3,40}\s[-–]\s/, '').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').trim()
  const groups = new Map()
  for (const e of [...(events ?? [])].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))) {
    const k = norm(e.title)
    if (!groups.has(k)) groups.set(k, { ...e, also: [] })
    else { const g = groups.get(k); if (e.date !== g.date && !g.also.includes(e.date)) g.also.push(e.date) }
  }
  return [...groups.values()]
}

const shortDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')

/** A watch's date as an outing row (the scout's table): the night, where, what the page says, from $N. */
export function watchOuting(e, watch) {
  return {
    kind: watch.whose === 'family' ? 'family' : 'couple',
    title: e.title,
    when: e.time ? `${e.date} ${e.time}` : e.date,
    recurring: null,
    place: [e.venue, e.town].filter(Boolean).join(', ') || null,
    address: null,
    url: e.url,
    why: [e.line, e.price_from ? `From $${e.price_from}.` : null, e.also?.length ? `Also ${e.also.slice(0, 4).map(shortDay).join(', ')}${e.also.length > 4 ? ' and more' : ''}.` : null].filter(Boolean).join(' ') || null,
    free: e.price_from === 0 ? true : null,
    source: 'search',
    source_ref: 'watch',
    watch_id: watch.id,
  }
}

// ---- More like this (canvas 86F; Jake, Oct 9: "Like MaryLous.. I have no idea if there are other places with a similar
// vibe/scene. its very house, high society, fine clothes type joint"). ----

/** One grounded search: what the place is known for, and a few others with the same scene near home. */
export function likePrompt(p, { today, have = [] }) {
  const known = [p.shelf_label, p.heard, ...(p.buzz ?? []).map((b) => b?.said)].filter(Boolean).join(' · ')
  return `Search the web now (today is ${today}). First, what is "${p.name}"${p.address ? ` (${p.address})` : ''} known for — its scene, music, crowd, dress, price? ${known ? `(Notes: ${known})` : ''}
Then find up to 5 OTHER places in Palm Beach County or Broward County, Florida with the same scene — the kind of place someone who loves ${p.name} would love. Locals' picks and the local press first; no national chains${have.length ? `; not these, they know them: ${have.slice(0, 40).join(', ')}` : ''}.
For each: "name" (as the place calls itself), "town", "what" (what it is, under 20 words, only what sources say), "alike" (what it shares with ${p.name}, under 10 words), "source" (where you read it, e.g. "Palm Beach Illustrated").
Answer with only JSON: {"known_for": "under 12 words", "places": [{"name": "...", "town": "...", "what": "...", "alike": "...", "source": "..."}]}`
}

/** The search's answer: what it's known for, and the places (named, not itself). */
export function parseLike(text, name) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''))
  let v = null
  try { v = m ? JSON.parse(m[0]) : null } catch { v = null }
  const self = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const places = (Array.isArray(v?.places) ? v.places : []).flatMap((x) => {
    const n = clean(x?.name, 100)
    if (!n || n.toLowerCase().replace(/[^a-z0-9]+/g, '') === self) return []
    return [{ name: n, town: clean(x?.town, 60), what: clean(x?.what, 180), alike: clean(x?.alike, 90), source: clean(x?.source, 80) }]
  })
  return { knownFor: clean(v?.known_for, 120), places: places.slice(0, 5) }
}
