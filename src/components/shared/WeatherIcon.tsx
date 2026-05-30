import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Wind, CloudDrizzle } from 'lucide-react'

interface WeatherIconProps {
  condition: string | null | undefined
  size?: number
  className?: string
}

/**
 * Renders a small weather icon based on a natural-language condition string
 * (e.g. "Partly cloudy, 78°F", "Rainy", "Sunny and warm").
 * Returns null if no condition is provided.
 */
export function WeatherIcon({ condition, size = 14, className = '' }: WeatherIconProps) {
  if (!condition) return null
  const c = condition.toLowerCase()

  if (c.includes('thunder') || c.includes('storm') || c.includes('lightning'))
    return <CloudLightning size={size} className={`text-purple-400 ${className}`} />
  if (c.includes('snow') || c.includes('sleet') || c.includes('hail') || c.includes('freez'))
    return <CloudSnow size={size} className={`text-blue-300 ${className}`} />
  if (c.includes('drizzle'))
    return <CloudDrizzle size={size} className={`text-blue-400 ${className}`} />
  if (c.includes('rain') || c.includes('shower') || c.includes('precip'))
    return <CloudRain size={size} className={`text-blue-500 ${className}`} />
  if (c.includes('wind') || c.includes('breezy') || c.includes('gusts'))
    return <Wind size={size} className={`text-teal-400 ${className}`} />
  if (c.includes('overcast') || c.includes('fog') || c.includes('mist') || c.includes('haze'))
    return <Cloud size={size} className={`text-gray-400 ${className}`} />
  if (c.includes('cloud') || c.includes('partly'))
    return <Cloud size={size} className={`text-gray-300 ${className}`} />

  // Default: sunny / clear
  return <Sun size={size} className={`text-amber-400 ${className}`} />
}
