// Geographic distance and location utility for localized search biasing and proximity badges.

export interface GeoCoordinates {
  lat: number
  lng: number
}

// Default Casa household anchor coordinates (Palm Beach County, FL)
export const DEFAULT_HOUSEHOLD_COORDINATES: GeoCoordinates = {
  lat: 26.8386,
  lng: -80.0831,
}

/**
 * Calculates the great-circle distance between two geographic points in miles using the Haversine formula.
 */
export function computeDistanceMiles(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const R = 3958.8 // Earth's radius in miles

  const dLat = toRad(toLat - fromLat)
  const dLng = toRad(toLng - fromLng)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Formats a distance in miles into a concise, distance-readable badge string.
 * e.g., 0.3 -> "< 0.5 mi", 1.24 -> "1.2 mi", 12.8 -> "13 mi"
 */
export function formatDistanceMiles(miles: number | null | undefined): string | null {
  if (miles === null || miles === undefined || !Number.isFinite(miles) || miles < 0) {
    return null
  }
  if (miles < 0.5) {
    return '< 0.5 mi'
  }
  if (miles < 10) {
    return `${miles.toFixed(1)} mi`
  }
  return `${Math.round(miles)} mi`
}
