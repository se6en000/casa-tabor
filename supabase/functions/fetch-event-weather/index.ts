import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// WMO weather code → short human-readable condition
function wmoCondition(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mostly Clear'
  if (code === 2) return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 49) return 'Foggy'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Rain Showers'
  if (code <= 94) return 'Thunderstorm'
  return 'Stormy'
}

// WMO code → simple icon keyword (used by WeatherIcon component on the frontend)
function wmoIcon(code: number): string {
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2) return 'partly_cloudy'
  if (code === 3) return 'cloudy'
  if (code <= 49) return 'fog'
  if (code <= 59) return 'drizzle'
  if (code <= 69) return 'rain'
  if (code <= 79) return 'snow'
  if (code <= 84) return 'rain'
  if (code <= 94) return 'thunderstorm'
  return 'thunderstorm'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { event_id } = await req.json()
  if (!event_id) {
    return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Load the event
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, location_name, address, status')
    .eq('id', event_id)
    .single()

  if (evErr || !event) {
    return new Response(JSON.stringify({ error: evErr?.message ?? 'Event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Only fetch weather if:
  // 1. Event has a location
  // 2. Event is within the next 4 days (weather accuracy window)
  // 3. Event is not cancelled
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

  // Geocode using Nominatim (OpenStreetMap) — handles addresses, business names, cities
  async function geocode(query: string): Promise<{ lat: string; lon: string } | null> {
    await new Promise(r => setTimeout(r, 200)) // polite delay
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'CasaTabor/1.0 (family-command-center)' } }
    )
    try {
      const json = await res.json() as unknown[]
      return (json?.[0] as { lat: string; lon: string }) ?? null
    } catch { return null }
  }

  // Try full address, then a cleaned-up version (strips suite/unit numbers and field prefixes)
  const cleanLocation = location
    .replace(/\b(STE|SUITE|APT|UNIT|FLOOR|FL|BLDG|RM|ROOM|#)\s*\S+/gi, '')
    .replace(/^Field\s+\d+[,\s]*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const loc = (await geocode(location)) ?? (cleanLocation !== location ? await geocode(cleanLocation) : null)

  if (!loc) {
    return new Response(JSON.stringify({ ok: false, error: `Could not geocode: ${location}` }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Fetch hourly forecast for the event date
  const dateStr = eventDate.toISOString().slice(0, 10)
  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&hourly=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto` +
    `&start_date=${dateStr}&end_date=${dateStr}`
  )
  const wxJson = await wxRes.json()

  if (!wxJson.hourly) {
    return new Response(JSON.stringify({ ok: false, error: 'No forecast data returned' }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  // Find the closest hour to the event start time
  const eventHour = eventDate.getHours()
  const hours: string[] = wxJson.hourly.time
  const temps: number[]  = wxJson.hourly.temperature_2m
  const codes: number[]  = wxJson.hourly.weathercode

  let closestIdx = 0
  let closestDiff = Infinity
  for (let i = 0; i < hours.length; i++) {
    const h = new Date(hours[i]).getHours()
    const diff = Math.abs(h - eventHour)
    if (diff < closestDiff) { closestDiff = diff; closestIdx = i }
  }

  const temp = Math.round(temps[closestIdx])
  const code = codes[closestIdx]
  const condition = wmoCondition(code)
  const icon = wmoIcon(code)
  const weatherText = `${condition}, ${temp}°F`

  // Upsert into event_enrichments
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
