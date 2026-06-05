import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.location',
      },
      body: JSON.stringify({ textQuery: address, maxResultCount: 1 }),
    })
    const data = await res.json()
    const loc = data.places?.[0]?.location
    if (!loc) return null
    return { lat: loc.latitude, lng: loc.longitude }
  } catch { return null }
}

async function fetchDailyForecast(lat: number, lng: number, _apiKey: string) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&forecast_days=5&timezone=auto`
    )
    if (!res.ok) return null
    const data = await res.json()
    const day = data.daily
    if (!day) return null
    return {
      weatherCodes: day.weather_code as number[],
      maxTemps: day.temperature_2m_max as number[],
      minTemps: day.temperature_2m_min as number[],
      precipProbs: day.precipitation_probability_max as number[],
      dates: day.time as string[],
    }
  } catch { return null }
}

function wmoCodeToCondition(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 65) return code <= 63 ? 'Rain' : 'Heavy rain'
  if (code <= 75) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  return 'Thunderstorm with hail'
}

function wmoCodeToIcon(code: number): string {
  if (code === 0) return 'sunny'
  if (code <= 2) return 'partly_cloudy'
  if (code === 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain'
  if (code <= 86) return 'snow'
  return 'thunderstorm'
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

  // Find the forecast day matching the event date
  const eventDateStr = new Date(event.start_time).toISOString().slice(0, 10)
  const dayIndex = forecast.dates.indexOf(eventDateStr)
  const idx = dayIndex >= 0 ? dayIndex : 0
  const code = forecast.weatherCodes[idx]
  const maxTemp = Math.round(forecast.maxTemps[idx])
  const minTemp = Math.round(forecast.minTemps[idx])
  const condition = wmoCodeToCondition(code)
  const icon = wmoCodeToIcon(code)
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
