/**
 * Parses a Google Places API (New) `addressComponents` array into the
 * street/city/state/zip fields Casa stores separately on saved_places
 * (and saved_contacts' inline place creation). Using the structured
 * components — rather than splitting a single formattedAddress string —
 * avoids dumping the whole address into one field with city/state/zip left
 * blank, which is a direct contributor to duplicate/inconsistent records.
 *
 * @param {Array<{ longText?: string; shortText?: string; types?: string[] }>|undefined} components
 * @returns {{ street: string|null, city: string|null, state: string|null, zip: string|null }}
 */
export function parseGoogleAddressComponents(components) {
  const list = Array.isArray(components) ? components : []
  const byType = (type) => list.find((c) => Array.isArray(c?.types) && c.types.includes(type))

  const streetNumber = byType('street_number')?.longText
  const route = byType('route')?.shortText ?? byType('route')?.longText
  const street = [streetNumber, route].filter(Boolean).join(' ') || null

  const city = byType('locality')?.longText
    ?? byType('postal_town')?.longText
    ?? byType('sublocality')?.longText
    ?? null
  const state = byType('administrative_area_level_1')?.shortText
    ?? byType('administrative_area_level_1')?.longText
    ?? null
  const zip = byType('postal_code')?.longText ?? null

  return { street, city, state, zip }
}
