import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google Geocoding: address → lat/lng
async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    )
    const data = await res.json()
    const loc = data.results?.[0]?.geometry?.location
    if (!loc) return null
    return { lat: loc.lat, lng: loc.lng }
  } catch { return null }
}

// Google Weather forecast: get daily forecast for a location
async function fetchDailyForecast(lat: number, lng: number, apiKey: string) {
  try {
    const res = await fetch(
      `https://weather.googleapis.com/v1/forecast/days:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ location: { latitude: lat, longitude: lng }, days: 1, unitsSystem: 'IMPERIAL' }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const day = data.forecastDays?.[0]
    if (!day) return null
    const condition = day.daytimeForecast?.weatherCondition?.description?.text
      ?? day.daytimeForecast?.weatherCondition?.description
      ?? 'Unknown'
    const maxTemp = Math.round(day.maxTemperature?.degrees ?? 0)
    const minTemp = Math.round(day.minTemperature?.degrees ?? 0)
    return { condition, maxTemp, minTemp }
  } catch { return null }
}

function conditionToIcon(condition: string): string {
  const c = condition.toLowerCase()
  if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm'
  if (c.includes('snow') || c.includes('blizzard')) return 'snow'
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return 'rain'
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 'fog'
  if (c.includes('partly cloudy') || c.includes('mostly clear')) return 'partly_cloudy'
  if (c.includes('cloudy') || c.includes('overcast')) return 'cloudy'
  if (c.includes('clear') || c.includes('sunny')) return 'sunny'
  return 'partly_cloudy'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

  const { event_id } = await req.json()
  if (!event_id) {
    return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, location_name, address, status')
    .eq('id', event_id)
    .single()

  if (evErr || !event) {
    return new Response(JSON.stringify({ error: evErr?.message ?? 'Event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const location = event.address || event.location_name
  if (!location) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no location' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const eventDate = new Date(event.start_time)
  const now = new Date()
  const daysAhead = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

  if (daysAhead < 0 || daysAhead > 4) {
    return new Response(JSON.stringify({ ok: true, skipped: 'outside 4-day window' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  if (event.status === 'cancelled') {
    return new Response(JSON.stringify({ ok: true, skipped: 'cancelled' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Try full address, then cleaned version
  const cleanLocation = location
    .replace(/\b(STE|SUITE|APT|UNIT|FLOOR|FL|BLDG|RM|ROOM|#)\s*\S+/gi, '')
    .replace(/^Field\s+\d+[,\s]*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const loc = (await geocodeAddress(location, apiKey))
    ?? (cleanLocation !== location ? await geocodeAddress(cleanLocation, apiKey) : null)

  if (!loc) {
    return new Response(JSON.stringify({ ok: false, error: `Could not geocode: ${location}` }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const forecast = await fetchDailyForecast(loc.lat, loc.lng, apiKey)
  if (!forecast) {
    return new Response(JSON.stringify({ ok: false, error: 'No forecast data returned' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const { condition, maxTemp, minTemp } = forecast
  const icon = conditionToIcon(condition)
  const weatherText = `${condition}, ${maxTemp}°F / ${minTemp}°F`

  const { error: upsertErr } = await sb
    .from('event_enrichments')
    .upsert(
      {
        event_id: event_id,
        weather_at_event: weatherText,
        weather_icon: icon,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id', ignoreDuplicates: false }
    )

  if (upsertErr) {
    return new Response(JSON.stringify({ ok: false, error: upsertErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ ok: true, weather: weatherText, icon }),
    { headers: { ...CORS, 'content-type': 'application/json' } }
  )
})
