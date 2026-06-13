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

async function fetchHourlyForecast(lat: number, lng: number, _apiKey: string) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=weather_code,temperature_2m,precipitation_probability&temperature_unit=fahrenheit&forecast_days=5&timezone=GMT`
    )
    if (!res.ok) return null
    const data = await res.json()
    const hourly = data.hourly
    if (!hourly) return null
    return {
      weatherCodes: hourly.weather_code as number[],
      temps: hourly.temperature_2m as number[],
      precipProbs: hourly.precipitation_probability as number[],
      times: hourly.time as string[],
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

  const forecast = await fetchHourlyForecast(loc.lat, loc.lng, apiKey)
  if (!forecast) {
    return new Response(JSON.stringify({ ok: false, error: 'No forecast data returned' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Match the forecast point closest to the event time (in UTC/GMT).
  const eventTs = new Date(event.start_time).getTime()
  const eventHour = new Date(event.start_time).toISOString().slice(0, 13)
  const exactIdx = forecast.times.findIndex((t) => t.startsWith(eventHour))
  let idx = exactIdx
  if (idx < 0) {
    let minDelta = Number.POSITIVE_INFINITY
    for (let i = 0; i < forecast.times.length; i++) {
      const ts = Date.parse(`${forecast.times[i]}:00Z`)
      if (Number.isNaN(ts)) continue
      const delta = Math.abs(ts - eventTs)
      if (delta < minDelta) {
        minDelta = delta
        idx = i
      }
    }
  }
  if (idx < 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No matching hourly forecast found' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const code = forecast.weatherCodes[idx]
  const temp = Math.round(forecast.temps[idx])
  const precip = Math.round(forecast.precipProbs[idx] ?? 0)
  const condition = wmoCodeToCondition(code)
  const icon = wmoCodeToIcon(code)
  const weatherText = `${condition}, ${temp}°F, ${precip}% rain chance`

  const { error: upsertErr } = await sb
    .from('event_enrichments')
    .upsert(
      {
        event_id: event_id,
        weather_at_event: weatherText,
        weather_summary: weatherText,
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
