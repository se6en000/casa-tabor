const ROUTE_QUERY = /\b(?:how long (?:will|does|would) it take to (?:get|drive|travel)(?:\s+there)?|how long (?:is|will be) the drive|drive time|travel time|eta|when should (?:i|we) leave|what time should (?:i|we) leave|how far (?:away|is it)|route (?:there|to it)|get there)\b/i
const AMBIGUOUS_DURATION_QUERY = /^\s*how long (?:will|does|would) it(?:\s+take)?[?.!]*\s*$/i

export function classifyEventTravelFollowUp(text) {
  const input = String(text ?? '').trim()
  if (!input) return null
  if (ROUTE_QUERY.test(input)) return 'route'
  if (AMBIGUOUS_DURATION_QUERY.test(input)) return 'ambiguous'
  return null
}

export function eventTravelDestination(event) {
  if (!event) return null
  const address = typeof event.address === 'string' ? event.address.trim() : ''
  const location = typeof event.location_name === 'string'
    ? event.location_name.trim()
    : typeof event.location === 'string'
      ? event.location.trim()
      : ''
  return address || location || null
}

export function formatEventTravelAnswer(event, route, formatTime = (value) => value) {
  const title = event?.title || 'that event'
  const driveMins = Number(route?.drive_time_mins)
  if (!route?.found || !Number.isFinite(driveMins) || driveMins <= 0) return null

  const distance = Number(route.distance_miles)
  const distanceText = Number.isFinite(distance) && distance > 0 ? `, about ${distance} miles` : ''
  const traffic = Number(route.traffic_delay_mins)
  const trafficText = Number.isFinite(traffic) && traffic > 0 ? ` Traffic adds about ${traffic} minutes.` : ''
  const leaveBy = route.leave_by
    ? ` To arrive with the planned ${Number(route.buffer_mins) || 0}-minute buffer, leave by ${formatTime(route.leave_by)}.`
    : ''
  return `The drive from home to "${title}" is about ${Math.round(driveMins)} minutes${distanceText}.${trafficText}${leaveBy}`
}
