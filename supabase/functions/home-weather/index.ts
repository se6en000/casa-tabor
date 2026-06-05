import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${apiKey}`
    )
    const data = await res.json()
    const loc = data.results?.[0]?.geometry?.location
    if (!loc) return null
    return { lat: loc.lat, lng: loc.lng }
  } catch { return null }
}

async function fetchCurrentWeather(lat: number, lng: number, apiKey: string) {
  try {
    const res = await fetch(
      `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ location: { latitude: lat, longitude: lng }, unitsSystem: 'IMPERIAL' }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      temp: Math.round(data.temperature?.degrees ?? 0),
      feelsLike: Math.round(data.feelsLikeTemperature?.degrees ?? 0),
      humidity: data.humidity ?? null,
      uvIndex: data.uvIndex ?? null,
      condition: data.weatherCondition?.description?.text ?? data.weatherCondition?.description ?? 'Unknown',
      icon: data.weatherCondition?.iconBaseUri ?? null,
    }
  } catch { return null }
}

async function fetchAirQuality(lat: number, lng: number, apiKey: string) {
  try {
    const res = await fetch(
      `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ location: { latitude: lat, longitude: lng } }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const indexes: { code?: string; aqi?: number; category?: string; dominantPollutant?: string }[] = data.indexes ?? []
    const uaqi = indexes.find(i => i.code === 'uaqi') ?? indexes[0]
    if (!uaqi) return null
    return {
      aqi: uaqi.aqi ?? 0,
      category: uaqi.category ?? 'Unknown',
      dominantPollutant: uaqi.dominantPollutant ?? 'unknown',
    }
  } catch { return null }
}

async function fetchPollen(lat: number, lng: number, apiKey: string) {
  try {
    const res = await fetch(
      `https://pollen.googleapis.com/v1/forecast:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&days=1`
    )
    if (!res.ok) return null
    const data = await res.json()
    const dayInfo = data.dailyInfo?.[0]?.pollenTypeInfo ?? []
    const result: Record<string, string> = { tree: 'None', grass: 'None', weed: 'None' }
    for (const p of dayInfo) {
      const code = (p.code ?? '').toLowerCase()
      const category = p.indexInfo?.category ?? 'None'
      if (code === 'tree') result.tree = category
      else if (code === 'grass') result.grass = category
      else if (code === 'weed') result.weed = category
    }
    return result as { tree: string; grass: string; weed: string }
  } catch { return null }
}

// Map Google Weather icon URI or condition string to a simple icon keyword
function deriveIcon(condition: string): string {
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

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Load home city from settings
  const { data: settingsRow } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'home_config')
    .single()

  const city: string = settingsRow?.value?.city || settingsRow?.value?.address || ''
  if (!city) {
    return new Response(JSON.stringify({ error: 'No home city configured' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const loc = await geocodeCity(city, apiKey)
  if (!loc) {
    return new Response(JSON.stringify({ error: `Could not geocode: ${city}` }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // Fetch all three in parallel
  const [weatherData, airQuality, pollen] = await Promise.all([
    fetchCurrentWeather(loc.lat, loc.lng, apiKey),
    fetchAirQuality(loc.lat, loc.lng, apiKey),
    fetchPollen(loc.lat, loc.lng, apiKey),
  ])

  const condition = weatherData?.condition ?? 'Unknown'
  const result = {
    temp: weatherData?.temp ?? 0,
    condition,
    icon: deriveIcon(condition),
    humidity: weatherData?.humidity ?? undefined,
    feelsLike: weatherData?.feelsLike ?? undefined,
    uvIndex: weatherData?.uvIndex ?? undefined,
    airQuality: airQuality ?? undefined,
    pollen: pollen ?? undefined,
    city,
  }

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
