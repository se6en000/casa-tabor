import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface WeatherResult {
  temp: number
  condition: string
  city: string
}

async function fetchWeather(): Promise<WeatherResult | null> {
  // Load home config to get city
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'home_config')
    .single()

  const city: string = data?.value?.city || data?.value?.address || ''
  if (!city) return null

  // Use open-meteo geocoding + weather (free, no API key)
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  )
  const geoJson = await geoRes.json()
  const loc = geoJson.results?.[0]
  if (!loc) return null

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=auto`
  )
  const wxJson = await wxRes.json()
  const current = wxJson.current
  if (!current) return null

  const temp = Math.round(current.temperature_2m)
  const condition = wmoCondition(current.weathercode)
  const displayCity = loc.name || city

  return { temp, condition, city: displayCity }
}

// WMO weather code → short description
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

export function useHomeWeather() {
  return useQuery({
    queryKey: ['home-weather'],
    queryFn: fetchWeather,
    staleTime: 10 * 60 * 1000, // refresh every 10 min
    retry: false,
  })
}
