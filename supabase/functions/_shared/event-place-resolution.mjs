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

export function selectConfidentEventPlace(query, places) {
  const queryTokens = new Set(normalizedTokens(query))
  if (queryTokens.size === 0 || !Array.isArray(places)) return null

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
