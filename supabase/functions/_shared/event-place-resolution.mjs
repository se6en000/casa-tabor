const GEOGRAPHIC_PLACE_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'country',
  'locality',
  'postal_code',
  'sublocality',
])

function normalizedTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
}

// A plain word for a kind of place — "the gym", "school", "work", "the dentist" — names no business. Searching for it
// finds whichever one comes first (Kelly, Oct 2: "Gym" became IRON RELIGION GYM in Orlando); where the person goes for it
// is in their own calendar instead (pickUsualPlace).
const KIND_WORDS = new Set([
  'gym', 'school', 'work', 'office', 'doctor', 'doctors', 'dentist', 'dentists', 'store', 'park', 'pool', 'church',
  'practice', 'class', 'lesson', 'lessons', 'salon', 'barber', 'vet', 'library', 'airport', 'hospital', 'clinic',
  'pharmacy', 'grocery', 'groceries', 'mall', 'beach', 'game', 'field', 'court', 'studio', 'daycare', 'camp',
])
const FILLER = new Set(['the', 'my', 'a', 'an', 'our', 'to', 'at', 'her', 'his', 'their'])

/** Only a kind of place ("the gym", "Doctor"), no name of one. */
export function isGenericPlace(query) {
  const words = String(query ?? '').toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).map((w) => w.replace(/'s$/, '')).filter((w) => w && !FILLER.has(w))
  return words.length > 0 && words.every((w) => KIND_WORDS.has(w))
}

/**
 * Where this person last went for it ("the gym" → the gym Kelly's calendar has been at), from past events with an
 * address; failing that, where anyone in the family last went for it. `past`: { title, location_name, address,
 * start_time, member_ids }, any order.
 */
export function pickUsualPlace(query, past, memberIds = []) {
  if (!isGenericPlace(query) || !Array.isArray(past)) return null
  const keys = new Set(normalizedTokens(query).filter((w) => KIND_WORDS.has(w)))
  const about = (row) => {
    const tokens = new Set([...normalizedTokens(row?.title), ...normalizedTokens(row?.location_name)])
    return [...keys].some((k) => tokens.has(k) || tokens.has(`${k}s`))
  }
  const usable = past
    .filter((row) => String(row?.address ?? '').trim() && String(row?.location_name ?? '').trim() && about(row))
    .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))
  const own = usable.find((row) => Array.isArray(row.member_ids) && row.member_ids.some((id) => memberIds.includes(id)))
  const pick = own ?? usable[0]
  return pick ? { name: pick.location_name, address: pick.address } : null
}

export function selectConfidentEventPlace(query, places) {
  const queryTokens = new Set(normalizedTokens(query))
  if (queryTokens.size === 0 || !Array.isArray(places)) return null
  if (isGenericPlace(query)) return null

  for (const place of places) {
    const primaryType = String(place?.primary_type ?? '').trim()
    if (GEOGRAPHIC_PLACE_TYPES.has(primaryType)) continue
    const nameTokens = normalizedTokens(place?.name)
    if (!nameTokens.some((token) => queryTokens.has(token))) continue
    if (!String(place?.address ?? '').trim()) continue
    return place
  }
  return null
}

export function findSavedEventPlace(query, savedPlaces) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase()
  if (!normalizedQuery || !Array.isArray(savedPlaces)) return null

  return savedPlaces.find((place) => {
    const names = [place?.name, ...(Array.isArray(place?.aliases) ? place.aliases : [])]
    return names.some((name) => String(name ?? '').trim().toLowerCase() === normalizedQuery)
  }) ?? null
}

/** The usual place from the calendar itself: a year of past events with an address (one read), for pickUsualPlace. */
export async function findUsualPlace(sb, query, memberIds = []) {
  if (!isGenericPlace(query)) return null
  const now = new Date()
  const { data, error } = await sb.from('events')
    .select('title, location_name, address, start_time, event_members(family_member_id)')
    .is('deleted_at', null)
    .not('address', 'is', null)
    .lt('start_time', now.toISOString())
    .gte('start_time', new Date(now.getTime() - 365 * 86_400_000).toISOString())
    .order('start_time', { ascending: false })
    .limit(400)
  if (error || !Array.isArray(data)) return null
  const past = data.map((row) => ({ ...row, member_ids: (row.event_members ?? []).map((m) => m?.family_member_id).filter(Boolean) }))
  return pickUsualPlace(query, past, memberIds)
}

const MILES_FROM_HOME = 40
const milesBetween = (a, b) => {
  const r = (d) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}
const stem = (w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)

/**
 * How sure a search is of the place (Jake, Oct 2: "what happens if it doesn't really know the place … 50% or 60%"):
 * 'sure' — one place has every word that was said in its name, near home (or in the town that was said): filled in;
 * 'unsure' — several do, or only some words match: up to three `choices`, nothing written; 'none' — no idea.
 * A plain kind of place ("Gym") is never sure: that's the usual place (pickUsualPlace), not a search.
 */
export function placeConfidence(query, places, home) {
  const none = { level: 'none', pick: null, choices: [] }
  if (isGenericPlace(query) || !Array.isArray(places)) return none
  const said = normalizedTokens(query).map(stem)
  if (said.length === 0) return none
  const scored = []
  for (const place of places) {
    if (GEOGRAPHIC_PLACE_TYPES.has(String(place?.primary_type ?? '').trim())) continue
    const address = String(place?.address ?? '').trim()
    if (!address) continue
    const name = new Set(normalizedTokens(place?.name).map(stem))
    const where = new Set(normalizedTokens(address).map(stem))
    // A word said that's the place's town ("Iron Religion Orlando") says where, not what.
    const town = said.filter((w) => !name.has(w) && where.has(w))
    const what = said.filter((w) => !town.includes(w))
    if (what.length === 0) continue
    const shared = what.filter((w) => name.has(w)).length
    if (shared === 0) continue
    const far = home && Number.isFinite(place?.lat) && Number.isFinite(place?.lng) && milesBetween(home, { lat: place.lat, lng: place.lng }) > MILES_FROM_HOME
    if (far && town.length === 0) continue
    scored.push({ place: { name: place.name, address, lat: place.lat ?? null, lng: place.lng ?? null }, strong: shared === what.length })
  }
  const strong = scored.filter((s) => s.strong).map((s) => s.place)
  if (strong.length === 1) return { level: 'sure', pick: strong[0], choices: [] }
  if (strong.length > 1) return { level: 'unsure', pick: null, choices: strong.slice(0, 3) }
  if (scored.length > 0) return { level: 'unsure', pick: null, choices: scored.slice(0, 3).map((s) => s.place) }
  return none
}

/** Home's coordinates, looked up once per warm instance: searches are made around home. */
let homeCoordsCache = null
export async function homeCoordinates(sb, homeConfig) {
  const address = homeConfig ? [homeConfig.address, homeConfig.city, homeConfig.state, homeConfig.zip].filter(Boolean).join(', ') : ''
  if (!address) return null
  if (homeCoordsCache?.key === address) return homeCoordsCache.value
  const res = await sb.functions.invoke('place-search', { body: { query: address } })
  const first = res?.data?.places?.[0]
  const value = first && Number.isFinite(first.lat) && Number.isFinite(first.lng) ? { lat: first.lat, lng: first.lng } : null
  homeCoordsCache = { key: address, value }
  return value
}

/** Search for a place around home (or in home's state when home has no coordinates); the places, or null on failure. */
export async function searchNearHome(sb, query, homeConfig) {
  const home = await homeCoordinates(sb, homeConfig)
  const res = await sb.functions.invoke('place-search', {
    body: home ? { query, lat: home.lat, lng: home.lng, radius: 65000 } : { query, city: homeConfig?.state || undefined },
  })
  if (res?.error) return { home, places: null, error: res.error }
  return { home, places: res?.data?.places ?? [], error: null }
}

/**
 * Where a draft's place is, before the yes (Jake, Oct 2: "Go for which one"): a saved place by name or alias; the
 * usual place for a kind of place ("the gym"); else a search around home — sure gives { name, address }, not sure
 * gives { choices } (up to three) to pick from on the card, no idea gives null (the name is kept as said).
 */
export async function draftPlace(sb, { query, homeConfig, savedPlaces = [], memberIds = [] }) {
  const said = String(query ?? '').trim()
  if (!said) return null
  const saved = findSavedEventPlace(said, savedPlaces)
  const savedAddress = saved ? [saved.address, saved.city, saved.state, saved.zip].filter(Boolean).join(', ') : ''
  if (saved && savedAddress) return { name: saved.name, address: savedAddress }
  if (isGenericPlace(said)) {
    const usual = await findUsualPlace(sb, said, memberIds)
    return usual ? { name: usual.name, address: usual.address } : null
  }
  const found = await searchNearHome(sb, said, homeConfig)
  if (!found.places) return null
  const verdict = placeConfidence(said, found.places, found.home)
  if (verdict.level === 'sure' && verdict.pick) return { name: verdict.pick.name, address: verdict.pick.address }
  if (verdict.level === 'unsure') return { choices: verdict.choices.map((c) => ({ name: c.name, address: c.address })) }
  return null
}
