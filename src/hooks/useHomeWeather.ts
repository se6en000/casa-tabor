import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface WeatherResult {
  temp: number
  condition: string
  icon: string
  humidity?: number
  feelsLike?: number
  uvIndex?: number
  precipProbability?: number
  airQuality?: { aqi: number; category: string; dominantPollutant: string }
  pollen?: { tree: string; grass: string; weed: string }
  city: string
}

async function fetchWeather(): Promise<WeatherResult | null> {
  const { data, error } = await supabase.functions.invoke('home-weather', {})
  if (error || !data) return null
  return data as WeatherResult
}

export function useHomeWeather() {
  return useQuery({
    queryKey: ['home-weather'],
    queryFn: fetchWeather,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}
