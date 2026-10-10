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
- "busy": when it's busiest and when it's quiet (days and times)
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

const clean = (v, n = 260) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const url = (v) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null)
const fact = (v) => {
  const text = clean(v?.text)
  return text ? { text, url: url(v?.url), as_of: clean(v?.as_of, 20) } : null
}

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
    dress: one('dress'), setting: one('setting'), crowd: one('crowd'), busy: one('busy'), best_time: one('best_time'),
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
