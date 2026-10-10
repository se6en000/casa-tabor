// A place up close, the whole story (Jake, Oct 10: "what would a pro put on here so i can see if I want to go … dress
// code, what the views are like, when its busy, when should you go, best days to go, are the any early bird, happy hour
// specials, what type of people go there"): Google's own facts (photos, reviews, what it serves, parking, hours) and
// one grounded search for the rest — every line with where it came from, nothing guessed.

/** Google Places (New) fields for the dossier: the Atmosphere ones, the reviews and the photos. */
export const DOSSIER_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri', 'websiteUri', 'nationalPhoneNumber',
  'rating', 'userRatingCount', 'priceLevel', 'priceRange', 'primaryTypeDisplayName', 'regularOpeningHours',
  'editorialSummary', 'generativeSummary', 'reviews', 'photos',
  'outdoorSeating', 'liveMusic', 'servesCocktails', 'servesBeer', 'servesWine', 'servesDessert', 'servesVegetarianFood',
  'servesBrunch', 'servesLunch', 'servesDinner', 'goodForGroups', 'goodForChildren', 'goodForWatchingSports', 'menuForChildren',
  'reservable', 'parkingOptions', 'paymentOptions', 'accessibilityOptions', 'allowsDogs',
].join(',')

const PRICE = { PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' }
const money = (m) => (m?.units ? `$${m.units}` : null)

/** Google's answer, as the sheet shows it: plain words, only what Google says (a missing field says nothing). */
export function googleFacts(p) {
  if (!p) return null
  const yes = (k, word) => (p[k] === true ? word : null)
  const parking = p.parkingOptions ?? {}
  const parkingWords = [parking.valetParking && 'valet', parking.freeParkingLot && 'free lot', parking.paidParkingLot && 'paid lot',
    parking.freeStreetParking && 'free street', parking.paidStreetParking && 'paid street', parking.paidGarageParking && 'paid garage', parking.freeGarageParking && 'free garage'].filter(Boolean)
  const range = p.priceRange?.startPrice ? [money(p.priceRange.startPrice), money(p.priceRange.endPrice)].filter(Boolean).join('–') : null
  return {
    name: p.displayName?.text ?? null,
    type: p.primaryTypeDisplayName?.text ?? null,
    address: p.formattedAddress ?? null,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    maps_url: p.googleMapsUri ?? null,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    price: [PRICE[p.priceLevel] ?? null, range ? `${range} a person` : null].filter(Boolean).join(' · ') || null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    summary: p.editorialSummary?.text ?? null,
    overview: p.generativeSummary?.overview?.text ?? null,
    serves: [yes('servesCocktails', 'cocktails'), yes('servesWine', 'wine'), yes('servesBeer', 'beer'), yes('servesDessert', 'dessert'),
      yes('servesVegetarianFood', 'vegetarian'), yes('servesBrunch', 'brunch'), yes('servesLunch', 'lunch'), yes('servesDinner', 'dinner')].filter(Boolean),
    has: [yes('outdoorSeating', 'outdoor seating'), yes('liveMusic', 'live music'), yes('reservable', 'takes reservations'),
      yes('goodForGroups', 'good for groups'), yes('goodForWatchingSports', 'sports on TV'), yes('goodForChildren', 'good for kids'),
      yes('menuForChildren', 'kids’ menu'), yes('allowsDogs', 'dogs allowed')].filter(Boolean),
    parking: parkingWords.length ? parkingWords.join(', ') : null,
    reviews: (p.reviews ?? []).slice(0, 5).map((r) => ({
      stars: r.rating ?? null, when: r.relativePublishTimeDescription ?? null, at: r.publishTime ?? null,
      text: String(r.text?.text ?? r.originalText?.text ?? '').trim(), by: r.authorAttribution?.displayName ?? null, by_url: r.authorAttribution?.uri ?? null,
    })).filter((r) => r.text),
    photos: (p.photos ?? []).slice(0, 8).map((ph) => ({ name: ph.name, w: ph.widthPx ?? null, h: ph.heightPx ?? null, by: (ph.authorAttributions ?? []).map((a) => a.displayName).filter(Boolean).join(', ') || null })),
  }
}

/** The rest, from the web: each answer with its page, or null — never a guess. */
export function dossierPrompt(place, { today }) {
  return `Search the web now (today is ${today}) about this one place: ${place.name}, ${place.address ?? ''}.
Read its own site and menus, its Instagram, OpenTable/Resy, Yelp and Tripadvisor, local press and recent reviews. A couple deciding whether to go wants:
- "dress": the dress code, or what people actually wear there
- "setting": the room and the views — inside, the bar, a patio, water or skyline views, how it feels
- "crowd": what kind of people go (ages, date night vs groups vs families, locals vs tourists)
- "busy": when it's busiest and when it's quiet (days and times), from reviews or articles — not its opening hours
- "best_time": the best days and times to go, and why
- "deals": happy hour, early bird, oyster or drink specials, weekly nights — each with its days, times and what it is
- "reservations": needed or not, how far ahead, walk-ins at the bar
- "parking": valet, lot, street, what it costs
- "noise": loud or easy to talk
- "order": the dishes and drinks people say to get (up to 5)
- "spend": what two people typically spend, if a page says
- "heads_up": anything to know first (auto gratuity, cash only, long waits, limited menu, closed days)
- "news": anything recent (opened, new chef, moved, closing), with its date
For each, answer under 30 words, from a page you actually read, with that page's address and its date if it shows one. If pages disagree, say so. If you found nothing, use null — never guess.
Answer with only JSON: {"dress": {"text": "...", "url": "https://...", "as_of": "2025-06" }, "setting": {...}, "crowd": {...}, "busy": {...}, "best_time": {...}, "deals": [{"text": "...", "when": "Wed–Sat 5–7 PM", "url": "...", "as_of": "..."}], "reservations": {...}, "parking": {...}, "noise": {...}, "order": {"items": ["..."], "url": "..."}, "spend": {...}, "heads_up": [{"text": "...", "url": "..."}], "news": {...}}`
}

// "Null", "N/A", "Not found" are nothing (the first live run wrote "Null" for parking).
const clean = (v, n = 260) => (typeof v === 'string' && v.trim() && !/^(null|none|n\/?a|not (found|mentioned|available|specified)|unknown)\.?$/i.test(v.trim()) ? v.trim().slice(0, n) : null)
const url = (v) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null)
const fact = (v) => {
  const text = clean(v?.text)
  return text ? { text, url: url(v?.url), as_of: clean(v?.as_of, 20) } : null
}

// "Busy" that's only its opening hours says nothing about the crowd (J&C Oyster, twice).
const busyOnly = (f) => (f && /\b(open|hours)\b/i.test(f.text) && !/\b(busy|busiest|crowd|crowded|packed|quiet|lively|wait|line|full)\b/i.test(f.text) ? null : f)

/** The search's answer, kept only where it says something with a page behind it (a line without a page is dropped). */
export function parseDossier(text, pages = []) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''))
  let v = null
  try { v = m ? JSON.parse(m[0]) : null } catch { v = null }
  if (!v || typeof v !== 'object') return null
  const sourced = (f) => (f && (f.url || pages.length) ? f : null)
  const one = (k) => sourced(fact(v[k]))
  const list = (k) => (Array.isArray(v[k]) ? v[k] : []).map((x) => {
    const f = fact(x)
    return f ? { ...f, when: clean(x?.when, 60) } : null
  }).filter(Boolean).filter(sourced).slice(0, 6)
  const items = Array.isArray(v.order?.items) ? v.order.items.map((x) => clean(x, 80)).filter(Boolean).slice(0, 5) : []
  return {
    dress: one('dress'), setting: one('setting'), crowd: one('crowd'), busy: busyOnly(one('busy')), best_time: one('best_time'),
    deals: list('deals'), reservations: one('reservations'), parking: one('parking'), noise: one('noise'),
    order: items.length ? { items, url: url(v.order?.url) } : null,
    spend: one('spend'), heads_up: list('heads_up'), news: one('news'),
  }
}

/** Where a line came from, short: "opentable.com · Jun 2025". */
export function sourceWord(f) {
  if (!f) return null
  let host = null
  try { host = f.url ? new URL(f.url).hostname.replace(/^www\./, '') : null } catch { host = null }
  return [host, f.as_of].filter(Boolean).join(' · ') || null
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }
/** "5:00 – 10:00 PM" → "5–10 PM"; "11:30 AM – 3:00 PM" → "11:30 AM–3 PM". */
const tidy = (h) => String(h).replace(/\u2009|\u202f/g, ' ').replace(/:00/g, '').replace(/\s*[–-]\s*/g, '–').trim()
const hoursOf = (descriptions) => new Map((descriptions ?? []).map((d) => {
  const m = /^(\w+):\s*(.*)$/.exec(String(d))
  return m ? [m[1], tidy(m[2])] : null
}).filter(Boolean))

/** Google's week in a line: "Wed–Sat 5–10 PM · closed Sun–Tue". */
export function hoursLine(descriptions) {
  const by = hoursOf(descriptions)
  if (!by.size) return null
  const runs = []
  for (const d of DAYS) {
    const h = by.get(d) ?? null
    const last = runs[runs.length - 1]
    if (last && last.h === h) last.to = d
    else runs.push({ from: d, to: d, h })
  }
  // Sunday's run joins Monday's when they match (closed Sun–Tue).
  if (runs.length > 1 && runs[0].h === runs[runs.length - 1].h) { const end = runs.pop(); runs[0] = { from: end.from, to: runs[0].to, h: runs[0].h } }
  const word = (r) => (r.from === r.to ? SHORT[r.from] : `${SHORT[r.from]}–${SHORT[r.to]}`)
  const open = runs.filter((r) => r.h && !/^closed$/i.test(r.h)).map((r) => `${word(r)} ${r.h}`)
  const closed = runs.filter((r) => !r.h || /^closed$/i.test(r.h)).map(word)
  return [...open, closed.length ? `closed ${closed.join(', ')}` : null].filter(Boolean).join(' · ')
}

/** Today's hours (the house's day): { open, text } — "Open today, 5–10 PM", "Closed today". Null when Google doesn't say. */
export function todayHours(descriptions, ymd) {
  const by = hoursOf(descriptions)
  if (!by.size || !ymd) return null
  const day = DAYS[(new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7]
  const h = by.get(day)
  if (!h) return null
  if (/^closed$/i.test(h)) return { open: false, text: 'Closed today' }
  if (/24 hours/i.test(h)) return { open: true, text: 'Open all day' }
  return { open: true, text: `Open today, ${h}` }
}

/** A review, short: its first sentences up to about n letters, never cut mid-word. */
export function reviewExcerpt(text, n = 170) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? []
  let out = ''
  for (const x of sentences) { if ((out + x).length > n) break; out += x }
  return (out.trim() || `${t.slice(0, n).replace(/\s+\S*$/, '')}…`).trim()
}

const WHO = { us: 'both of them', family: 'the family, kids too', jake: 'Jake', kelly: 'Kelly' }
/**
 * "For you two" (canvas 90A): what they love and like, against what the pages say — a check, a maybe, a no, or a note
 * (an hour's drive) — and Alexa's pick of when to go, from the hours, the deals and the busy times only.
 */
export function forYouPrompt({ place, google, web, interests = [], driveMin = null }) {
  const loves = (interests ?? []).filter((i) => i.level === 'love' || i.level === 'like').map((i) => `- ${i.name} — ${WHO[i.who] ?? 'them'} ${i.level === 'love' ? 'love' : 'like'}${i.who === 'jake' || i.who === 'kelly' ? 's' : ''} it`).join('\n')
  const nos = (interests ?? []).filter((i) => i.level === 'no').map((i) => `- ${i.name} (${WHO[i.who] ?? 'them'})`).join('\n')
  const facts = JSON.stringify({ google: google && { type: google.type, price: google.price, hours: google.hours, summary: google.summary, overview: google.overview, serves: google.serves, has: google.has, parking: google.parking }, web }, null, 0).slice(0, 9000)
  return `Jake and Kelly are deciding whether to go to ${place.name}${driveMin ? ` (a ${driveMin}-minute drive from home)` : ''}.
What they love and like:
${loves || '- (nothing said)'}
${nos ? `What they'd rather not:\n${nos}\n` : ''}What the pages say about it (only these facts):
${facts}
Write "for_you": 3 or 4 lines, what matters most to them first (their loves before their likes), one line per thing — never two about the same love. Each:
- "mark": "yes" only when the facts name the thing itself (a raw bar, an oyster deal — "cocktails" doesn't prove margaritas, "$9 spirits" doesn't prove tequila); "maybe" when they love it and the facts don't say either way; "no" for something they'd rather not; "note" for something to plan around (a drive over 40 minutes, the days it's closed, a set service charge).
- "head": under 6 words, saying who it's for — "Oysters, for Jake", "Margaritas, for Kelly?", "A good fish dish, for both", "A whole night out".
- "line": under 22 words, the specific thing from the facts — the dish, the deal with its price and hours, the room.
- "from": "Google" or the web page's host it came from, or null for the drive.
Then "best_time": the best day and time for the two of them to go, under 25 words, only from the hours, deals and busy facts — or null if they don't say enough.
Never invent a dish, a deal or a time. Answer with only JSON: {"for_you": [{"mark": "yes", "head": "...", "line": "...", "from": "..."}], "best_time": "..." }`
}

const MARKS = new Set(['yes', 'maybe', 'no', 'note'])
/** Its answer, kept only when whole. */
export function parseForYou(text) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ''))
  let v = null
  try { v = m ? JSON.parse(m[0]) : null } catch { v = null }
  const lines = (Array.isArray(v?.for_you) ? v.for_you : []).map((x) => ({
    mark: MARKS.has(x?.mark) ? x.mark : null, head: clean(x?.head, 60), line: clean(x?.line, 200), from: clean(x?.from, 60),
  })).filter((x) => x.mark && x.head && x.line)
    // One line a thing (the first live run gave "Oysters, for both" twice).
    .filter((x, i, all) => all.findIndex((y) => y.head.toLowerCase() === x.head.toLowerCase()) === i).slice(0, 4)
  return { for_you: lines, best_time: clean(v?.best_time, 220) }
}
