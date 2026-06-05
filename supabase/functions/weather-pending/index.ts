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

// Google Weather forecast: get daily forecast
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

async function fetchWeatherForEvent(
  sb: ReturnType<typeof createClient>,
  eventId: string,
  apiKey: string,
): Promise<{ ok: boolean; weather?: string; skipped?: string; error?: string }> {
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, location_name, address, status')
    .eq('id', eventId)
    .single()

  if (evErr || !event) return { ok: false, error: evErr?.message ?? 'not found' }

  const location = event.address || event.location_name
  if (!location) return { ok: true, skipped: 'no location' }

  const eventDate = new Date(event.start_time)
  const daysAhead = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  if (daysAhead < 0 || daysAhead > 4) return { ok: true, skipped: 'outside 4-day window' }
  if (event.status === 'cancelled') return { ok: true, skipped: 'cancelled' }

  const cleanLocation = location
    .replace(/\b(STE|SUITE|APT|UNIT|FLOOR|BLDG|RM|ROOM|#)\s*\S+/gi, '')
    .replace(/^Field\s+\d+[,\s]*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const loc = (await geocodeAddress(location, apiKey))
    ?? (cleanLocation !== location ? await geocodeAddress(cleanLocation, apiKey) : null)
  if (!loc) return { ok: false, error: `Could not geocode: ${location}` }

  const forecast = await fetchDailyForecast(loc.lat, loc.lng, apiKey)
  if (!forecast) return { ok: false, error: 'No forecast data' }

  const { condition, maxTemp, minTemp } = forecast
  const icon = conditionToIcon(condition)
  const weatherText = `${condition}, ${maxTemp}°F / ${minTemp}°F`

  const { error: upsertErr } = await sb
    .from('event_enrichments')
    .upsert(
      { event_id: eventId, weather_at_event: weatherText, weather_icon: icon, updated_at: new Date().toISOString() },
      { onConflict: 'event_id', ignoreDuplicates: false }
    )

  if (upsertErr) return { ok: false, error: upsertErr.message }
  return { ok: true, weather: weatherText }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)

  const { data: events, error } = await sb
    .from('events')
    .select(`id, title, location_name, address, event_enrichments ( weather_at_event )`)
    .eq('status', 'confirmed')
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .not('location_name', 'is', null)
    .order('start_time')
    .limit(20)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const needsWeather = (events ?? []).filter(ev => {
    const enr = Array.isArray(ev.event_enrichments) ? ev.event_enrichments[0] : ev.event_enrichments
    return !enr?.weather_at_event
  })

  const results: Record<string, unknown> = {}
  let updated = 0, skipped = 0, failed = 0

  for (const ev of needsWeather) {
    const d = await fetchWeatherForEvent(sb, ev.id, apiKey)
    if (d.ok && !d.skipped) { results[ev.id] = { ok: true, weather: d.weather }; updated++ }
    else if (d.skipped)     { results[ev.id] = { skipped: d.skipped }; skipped++ }
    else                    { results[ev.id] = { error: d.error }; failed++ }
  }

  return new Response(
    JSON.stringify({ ok: true, updated, skipped, failed, total: needsWeather.length, results }),
    { headers: { ...CORS, 'content-type': 'application/json' } }
  )
})
