// Places near home first (Jake, 2026-10-01: "Planet fitness should show me the ones in west palm first, then others
// within my radius … not just every main street randomly in the USA"). Google's text search only *restricts* to a
// rectangle (a circle restriction is refused, which fell back to a weak bias and gave chains across the country),
// so the search is boxed around home, and the results are sorted by distance.

const KM_PER_DEG_LAT = 110.574

/** A rectangle about `km` out from a point, for Places `locationRestriction`. */
export function boxAround(lat, lng, km) {
  const dLat = km / KM_PER_DEG_LAT
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return { rectangle: { low: { latitude: lat - dLat, longitude: lng - dLng }, high: { latitude: lat + dLat, longitude: lng + dLng } } }
}

/** Miles between two points (haversine). */
export function milesBetween(a, b) {
  const R = 3958.8
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Nearest first, each with its distance in miles (one decimal under 10). */
export function nearestFirst(places, home) {
  return places
    .map((p) => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return { ...p, miles: null }
      const m = milesBetween(home, { lat: p.lat, lng: p.lng })
      return { ...p, miles: m < 10 ? Math.round(m * 10) / 10 : Math.round(m) }
    })
    .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity))
}
