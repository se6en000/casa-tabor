import { parseGoogleAddressComponents } from './google-address-components.mjs'

/**
 * Looks up a place by name/address text against Google Places Text Search
 * and returns Google-verified, split street/city/state/zip fields instead of
 * a single formatted-address string. Used by server-side flows (like the AI
 * assistant's associate_contact_place action) that create saved_places rows
 * from AI-provided text without an interactive Google-verified picker, so
 * those rows don't end up with the whole address dumped into one field and
 * city/state/zip left blank.
 *
 * @param {object} options
 * @param {(url: string, init: object) => Promise<Response>} options.fetchImpl
 * @param {string} options.apiKey
 * @param {string} options.query - place name and/or address text to search
 * @returns {Promise<{ verified: boolean, name: string|null, street: string|null, city: string|null, state: string|null, zip: string|null, formattedAddress: string|null, lat: number|null, lng: number|null }>}
 */
export async function verifyPlaceAddress({ fetchImpl, apiKey, query }) {
  const empty = {
    verified: false,
    name: null,
    street: null,
    city: null,
    state: null,
    zip: null,
    formattedAddress: null,
    lat: null,
    lng: null,
  }
  const trimmedQuery = query?.trim()
  if (!trimmedQuery || !apiKey) return empty

  let res
  try {
    res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.location',
      },
      body: JSON.stringify({ textQuery: trimmedQuery, maxResultCount: 1 }),
    })
  } catch {
    return empty
  }
  if (!res?.ok) return empty

  const data = await res.json().catch(() => null)
  const place = data?.places?.[0]
  if (!place) return empty

  const parsed = parseGoogleAddressComponents(place.addressComponents)
  return {
    verified: true,
    name: place.displayName?.text ?? null,
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    formattedAddress: place.formattedAddress ?? null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
  }
}
