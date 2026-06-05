import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.location',
      },
      body: JSON.stringify({ textQuery: city, maxResultCount: 1 }),
    })
    const data = await res.json()
    const loc = data.places?.[0]?.location
    if (!loc) return null
    return { lat: loc.latitude, lng: loc.longitude }
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

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,uv_index&daily=precipitation_probability_max,weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&forecast_days=3&timezone=auto`
  )
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Weather fetch failed' }), {
      status: 502,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const wx = await res.json()
  const c = wx.current

  const result = {
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    uvIndex: c.uv_index != null ? Math.round(c.uv_index) : null,
    precipProbability: c.precipitation_probability ?? null,
    condition: wmoCodeToCondition(c.weather_code),
    icon: wmoCodeToIcon(c.weather_code),
    city,
  }

  return new Response(JSON.stringify(result), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

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
