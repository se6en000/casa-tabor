import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

async function geocode(query: string): Promise<{ lat: string; lon: string } | null> {
  await new Promise(r => setTimeout(r, 200))
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'CasaTabor/1.0 (family-command-center)' } }
  )
  try {
    const json = await res.json() as unknown[]
    return (json?.[0] as { lat: string; lon: string }) ?? null
  } catch { return null }
}

async function fetchWeatherForEvent(
  sb: ReturnType<typeof createClient>,
  eventId: string
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
  const loc = (await geocode(location)) ?? (cleanLocation !== location ? await geocode(cleanLocation) : null)
  if (!loc) return { ok: false, error: `Could not geocode: ${location}` }

  const dateStr = eventDate.toISOString().slice(0, 10)
  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&hourly=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto` +
    `&start_date=${dateStr}&end_date=${dateStr}`
  )
  const wxJson = await wxRes.json()
  if (!wxJson.hourly) return { ok: false, error: 'No forecast data' }

  const eventHour = eventDate.getHours()
  const hours: string[] = wxJson.hourly.time
  const temps: number[] = wxJson.hourly.temperature_2m
  const codes: number[] = wxJson.hourly.weathercode

  let closestIdx = 0, closestDiff = Infinity
  for (let i = 0; i < hours.length; i++) {
    const diff = Math.abs(new Date(hours[i]).getHours() - eventHour)
    if (diff < closestDiff) { closestDiff = diff; closestIdx = i }
  }

  const weatherText = `${wmoCondition(codes[closestIdx])}, ${Math.round(temps[closestIdx])}°F`
  const icon = wmoIcon(codes[closestIdx])

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
    // Nominatim rate limit: 1 req/sec — allow up to 2 geocode calls per event
    await new Promise(r => setTimeout(r, 1200))
    const d = await fetchWeatherForEvent(sb, ev.id)
    if (d.ok && !d.skipped) { results[ev.id] = { ok: true, weather: d.weather }; updated++ }
    else if (d.skipped)     { results[ev.id] = { skipped: d.skipped }; skipped++ }
    else                    { results[ev.id] = { error: d.error }; failed++ }
  }

  return new Response(
    JSON.stringify({ ok: true, updated, skipped, failed, total: needsWeather.length, results }),
    { headers: { ...CORS, 'content-type': 'application/json' } }
  )
})

