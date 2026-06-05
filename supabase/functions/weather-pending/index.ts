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
