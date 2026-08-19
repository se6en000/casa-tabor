import { createTrackedMapsFetch } from '../_shared/provider-call-ledger.mjs'
import { parseGoogleAddressComponents } from '../_shared/google-address-components.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const mapsFetch = createTrackedMapsFetch({
  functionName: 'place-search',
  service: 'places',
  sku: 'Places Text Search',
  callPurpose: 'interactive-place-search',
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const { query, city, lat, lng, radius } = await req.json() as {
    query: string
    city?: string
    lat?: number
    lng?: number
    radius?: number
  }
  const textQuery = city ? `${query} in ${city}` : query

  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
  const searchRadius = typeof radius === 'number' && Number.isFinite(radius) ? radius : 50000.0

  const buildPayload = (useRestriction: boolean): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      textQuery,
      maxResultCount: 6,
    }
    if (hasCoords) {
      if (useRestriction) {
        payload.locationRestriction = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: searchRadius,
          },
        }
      } else {
        payload.locationBias = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: searchRadius,
          },
        }
      }
    }
    return payload
  }

  // 1. Try strict local restriction first so queries like "Walmart" or "Target" return local Palm Beach stores instead of Texas/California
  let res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.id,places.nationalPhoneNumber,places.primaryType',
    },
    body: JSON.stringify(buildPayload(hasCoords)),
  })

  let data = await res.json()

  // 2. If restricted search returns no results and coords were used, fall back to soft locationBias for out-of-area searches
  if (hasCoords && (!data.places || data.places.length === 0)) {
    const fallbackRes = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.id,places.nationalPhoneNumber,places.primaryType',
      },
      body: JSON.stringify(buildPayload(false)),
    })
    if (fallbackRes.ok) {
      data = await fallbackRes.json()
    }
  }

  if (!res.ok && !data?.places) {
    return new Response(JSON.stringify({ error: data?.error?.message ?? 'Places API error' }), {
      status: 502, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const places = (data.places ?? []).map((p: {
    id: string
    displayName?: { text: string }
    formattedAddress?: string
    addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]
    location?: { latitude: number; longitude: number }
    nationalPhoneNumber?: string
    primaryType?: string
  }) => {
    const parsed = parseGoogleAddressComponents(p.addressComponents)
    return {
      place_id: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      phone: p.nationalPhoneNumber ?? null,
      primary_type: p.primaryType ?? null,
    }
  })

  return new Response(JSON.stringify({ places }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
