const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not set' }), {
      status: 500, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const { query, city } = await req.json() as { query: string; city?: string }
  const textQuery = city ? `${query} in ${city}` : query

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id,places.nationalPhoneNumber',
    },
    body: JSON.stringify({ textQuery, maxResultCount: 5 }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data?.error?.message ?? 'Places API error' }), {
      status: 502, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const places = (data.places ?? []).map((p: {
    id: string
    displayName?: { text: string }
    formattedAddress?: string
    location?: { latitude: number; longitude: number }
    nationalPhoneNumber?: string
  }) => ({
    place_id: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    phone: p.nationalPhoneNumber ?? null,
  }))

  return new Response(JSON.stringify({ places }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
