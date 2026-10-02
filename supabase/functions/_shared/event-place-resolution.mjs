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
