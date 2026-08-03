function parseDurationSeconds(value) {
  if (typeof value !== 'string') return 0
  const m = value.match(/^([0-9]+)s$/)
  if (!m) return 0
  return Number(m[1] ?? 0)
}

function toIsoOrNull(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function round1(value) {
  return Math.round(value * 10) / 10
}

function shiftToFutureIso(iso, nowMs) {
  const date = new Date(iso)
  while (date.getTime() <= nowMs + 60 * 1000) {
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return date.toISOString()
}

export async function computeTravelEta({
  mapsKey,
  origin,
  destination,
  departureTimeIso = null,
  arrivalTimeIso = null,
  bufferMins = 10,
  signal,
}) {
  if (!mapsKey) return { found: false, error: 'GOOGLE_MAPS_API_KEY not configured' }
  if (!origin || !destination) return { found: false, error: 'Missing origin or destination' }

  const extractCityHint = (address) => {
    const parts = String(address).split(',').map((p) => p.trim()).filter(Boolean)
    return parts.length >= 2 ? parts[1] : null
  }

  const qualifyAddress = (input, cityHint = null) => {
    const raw = String(input ?? '').trim()
    if (!raw) return null
    if (cityHint && !/,/.test(raw) && !/\d/.test(raw)) {
      return `${raw}, ${cityHint}`
    }
    return raw
  }

  const cityHint = extractCityHint(origin) ?? (String(origin).includes(',') ? null : String(origin).trim() || null)
  const resolvedOrigin = qualifyAddress(origin, cityHint) ?? origin
  const resolvedDestination = qualifyAddress(destination, cityHint) ?? destination

  const callRoutes = async (depIso) => {
    const body = {
      origin: { address: resolvedOrigin },
      destination: { address: resolvedDestination },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'en-US',
      units: 'IMPERIAL',
      computeAlternativeRoutes: false,
      departureTime: depIso,
    }
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': mapsKey,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
      signal,
    })
    const data = await res.json()
    if (!res.ok) {
      const providerError = String(data?.error?.message ?? `Google Routes error ${res.status}`)
      if (/future time/i.test(providerError)) {
        const retryDeparture = new Date(Math.max(Date.now() + 2 * 60 * 1000, new Date(depIso).getTime() + 2 * 60 * 1000)).toISOString()
        const retryBody = { ...body, departureTime: retryDeparture }
        const retryRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
          },
          body: JSON.stringify(retryBody),
          signal,
        })
        const retryData = await retryRes.json()
        if (!retryRes.ok) {
          return {
            found: false,
            error: retryData?.error?.message ?? `Google Routes error ${retryRes.status}`,
          }
        }
        const retryRoute = retryData?.routes?.[0]
        if (!retryRoute) return { found: false, error: 'No route found' }
        const durationSec = parseDurationSeconds(retryRoute.duration)
        const staticDurationSec = parseDurationSeconds(retryRoute.staticDuration)
        const distanceMeters = Number(retryRoute.distanceMeters ?? 0)
        return { found: true, durationSec, staticDurationSec, distanceMeters, departureIso: retryDeparture }
      }
      return {
        found: false,
        error: providerError,
      }
    }
    const route = data?.routes?.[0]
    if (!route) return { found: false, error: 'No route found' }
    const durationSec = parseDurationSeconds(route.duration)
    const staticDurationSec = parseDurationSeconds(route.staticDuration)
    const distanceMeters = Number(route.distanceMeters ?? 0)
    return { found: true, durationSec, staticDurationSec, distanceMeters, departureIso: depIso }
  }

  const now = new Date()
  const nowMs = now.getTime()
  let arrivalIso = toIsoOrNull(arrivalTimeIso)
  let departureIso = toIsoOrNull(departureTimeIso)
  let rolledArrivalToTomorrow = false

  if (arrivalIso && new Date(arrivalIso).getTime() <= nowMs + 60 * 1000) {
    arrivalIso = shiftToFutureIso(arrivalIso, nowMs)
    rolledArrivalToTomorrow = true
  }
  if (departureIso && new Date(departureIso).getTime() <= nowMs + 60 * 1000) {
    departureIso = new Date(nowMs + 2 * 60 * 1000).toISOString()
  }

  if (!departureIso && arrivalIso) {
    const arrival = new Date(arrivalIso)
    const firstGuess = new Date(arrival.getTime() - 45 * 60 * 1000)
    const probe1 = await callRoutes(firstGuess.toISOString())
    if (!probe1.found) return probe1
    const leave1 = new Date(arrival.getTime() - (probe1.durationSec + bufferMins * 60) * 1000)
    const probe2 = await callRoutes(leave1.toISOString())
    if (!probe2.found) return probe2
    departureIso = probe2.departureIso ?? leave1.toISOString()
    const durationMins = Math.round(probe2.durationSec / 60)
    const staticMins = Math.round(probe2.staticDurationSec / 60)
    const delayMins = Math.max(0, durationMins - staticMins)
    const distanceMiles = probe2.distanceMeters / 1609.344
    return {
      found: true,
      origin: resolvedOrigin,
      destination: resolvedDestination,
      departure_time: departureIso,
      arrival_time: arrivalIso,
      leave_by: departureIso,
      drive_time_mins: durationMins,
      base_drive_time_mins: staticMins || null,
      traffic_delay_mins: delayMins || 0,
      distance_miles: round1(distanceMiles),
      buffer_mins: bufferMins,
      assumed_next_day: rolledArrivalToTomorrow,
      route_summary: `${Math.round(durationMins)} min • ${round1(distanceMiles)} mi${delayMins > 0 ? ` • +${delayMins} min traffic` : ''}`,
    }
  }

  if (!departureIso) departureIso = new Date(nowMs + 2 * 60 * 1000).toISOString()
  const route = await callRoutes(departureIso)
  if (!route.found) return route
  departureIso = route.departureIso ?? departureIso

  const durationMins = Math.round(route.durationSec / 60)
  const staticMins = Math.round(route.staticDurationSec / 60)
  const delayMins = Math.max(0, durationMins - staticMins)
  const distanceMiles = route.distanceMeters / 1609.344
  const depart = new Date(departureIso)
  const arrival = new Date(depart.getTime() + durationMins * 60 * 1000)
  return {
    found: true,
    origin: resolvedOrigin,
    destination: resolvedDestination,
    departure_time: departureIso,
    arrival_time: arrival.toISOString(),
    leave_by: departureIso,
    drive_time_mins: durationMins,
    base_drive_time_mins: staticMins || null,
    traffic_delay_mins: delayMins || 0,
    distance_miles: round1(distanceMiles),
    buffer_mins: bufferMins,
    route_summary: `${Math.round(durationMins)} min • ${round1(distanceMiles)} mi${delayMins > 0 ? ` • +${delayMins} min traffic` : ''}`,
  }
}
