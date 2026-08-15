const PICKUP_KEYWORDS = /\b(pick[\s-]?up|pickup|dismissal|carpool|drop[\s-]?off|dropoff|car line|carline)\b/i
const PICKUP_INTENT_KEYWORDS = /\b(pick[\s-]?up|pickup|collect|dismissal|car line|carline)\b/i
const DROPOFF_INTENT_KEYWORDS = /\b(drop[\s-]?off|dropoff|hand[\s-]?off|deliver)\b/i
const FLIGHT_KEYWORDS = /\bflight\b|(?:^|\s)[A-Z]{3}\s*(?:→|->)\s*[A-Z]{3}(?:\s|$)/i
const TRIP_KEYWORDS = /\b(trip|outing|camp|scalloping|excursion|road trip|day trip|festival|fair|beach|park day|vacation|staycation)\b/i
const COVERAGE_KEYWORDS = /\b(sitter|babysitter|nanny|caregiver|childcare|watching|watch(?:es)?|caring for)\b/i
const LOCATION_ONLY_KEYWORDS = /\b(sleep[\s-]?over|overnight stay|field trip|team bus)\b/i
const REMOTE_KEYWORDS = /\b(zoom|google meet|microsoft teams|facetime|video call|virtual|online|remote|phone call|online order|order submission|submit order|place order|order online|webinar|livestream|telehealth|portal)\b|https?:\/\//i

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function durationHours(event) {
  const start = new Date(event?.start_time).getTime()
  const end = new Date(event?.end_time).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, (end - start) / 3_600_000)
}

function isAtHome(event) {
  const location = `${text(event?.location_name)} ${text(event?.address)}`.toLowerCase()
  return !location.trim() || /\bhome\b/.test(location)
}

function localTime(iso, timezone) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value ?? ''
  const minute = parts.find((part) => part.type === 'minute')?.value ?? ''
  return hour && minute ? `${hour === '24' ? '00' : hour}:${minute}` : ''
}

function memberCanDrive(member) {
  if (!member || member.role === 'child') return false
  return member.can_drive ?? (member.role === 'parent' || member.role === 'caregiver')
}

export function classifyTransportationDefault(event, legacy = {}) {
  const title = text(event?.title)
  const description = text(event?.description)
  const location = text(event?.location_name)
  const address = text(event?.address)
  const searchable = `${title} ${description} ${location} ${address}`

  if (
    event?.event_type === 'reminder'
    || (
      event?.status === 'cancelled'
      && event?.record_kind !== 'series_template'
      && event?.record_kind !== 'template'
    )
    || event?.deleted_at
  ) {
    return { kind: 'none', reason: 'inactive' }
  }
  if (!location && !address) return { kind: 'none', reason: 'no_destination' }
  if (REMOTE_KEYWORDS.test(searchable)) return { kind: 'none', reason: 'remote' }
  if (COVERAGE_KEYWORDS.test(title)) return { kind: 'none', reason: 'coverage' }
  if (LOCATION_ONLY_KEYWORDS.test(title)) return { kind: 'none', reason: 'location_only' }
  if (isAtHome(event)) return { kind: 'none', reason: 'at_home' }
  if (FLIGHT_KEYWORDS.test(title)) return { kind: 'no_route', reason: 'flight' }

  const category = text(event?.category || event?.enrichment?.category)
  if (['task', 'reminder', 'chore', 'home_maintenance', 'family_admin'].includes(category) && !address) {
    return { kind: 'none', reason: 'task' }
  }
  const requestedMode = text(legacy?.mode_override)
  const trip = requestedMode === 'trip'
    || event?.all_day === true
    || durationHours(event) >= 4
    || category === 'travel'
    || category === 'holiday'
    || TRIP_KEYWORDS.test(title)
  if (trip) return { kind: 'no_route', reason: 'trip' }
  if (requestedMode === 'hosted') return { kind: 'none', reason: 'hosted' }

  const pickup = requestedMode === 'pickup' || PICKUP_KEYWORDS.test(title)
  if (pickup) {
    const hasPickup = PICKUP_INTENT_KEYWORDS.test(title)
    const hasDropoff = DROPOFF_INTENT_KEYWORDS.test(title)
    return {
      kind: 'pickup',
      intent: hasPickup && hasDropoff ? 'mixed' : hasDropoff ? 'dropoff' : 'pickup',
    }
  }
  return { kind: 'appointment' }
}

export function selectAttendingDriver(members = []) {
  const sorted = [...members].sort((left, right) => (
    left.assignment_role === 'primary' ? -1 : right.assignment_role === 'primary' ? 1 : 0
  ))
  return sorted.find(memberCanDrive) ?? null
}

function selectedDriver(legacy, members, householdMembers, oldLegIndex) {
  const overrideId = legacy?.driver_overrides?.[String(oldLegIndex)]
    ?? legacy?.driver_overrides?.[oldLegIndex]
  if (overrideId) {
    const override = householdMembers.find((member) => member.id === overrideId)
    if (override) return override
  }
  return selectAttendingDriver(members)
}

function passengerNames(members) {
  return [...members]
    .sort((left, right) => (
      left.assignment_role === 'primary' ? -1 : right.assignment_role === 'primary' ? 1 : 0
    ))
    .map((member) => text(member.name))
    .filter(Boolean)
}

function driverFields(driver) {
  return {
    driverId: driver?.id ?? null,
    driverName: text(driver?.name),
  }
}

function eventPlace(event) {
  const address = text(event?.address)
  return {
    name: text(event?.location_name) || address || 'Event location',
    address,
    kind: 'event',
  }
}

export function buildGeneratedTransportationPlan({
  event,
  homeAddress,
  members = [],
  householdMembers = [],
  legacy = {},
  timezone = 'America/New_York',
}) {
  const classification = classifyTransportationDefault(event, legacy)
  if (classification.kind !== 'appointment' && classification.kind !== 'pickup') {
    return { classification, plan: null }
  }
  if (!text(homeAddress)) {
    return { classification: { kind: 'none', reason: 'missing_home_address' }, plan: null }
  }
  if (!text(event?.address)) {
    return { classification: { kind: 'none', reason: 'missing_event_address' }, plan: null }
  }

  const passengers = passengerNames(members)
  const roster = [...passengers]
  const destination = eventPlace(event)
  const home = { name: 'Home', address: text(homeAddress) }
  const outboundDriver = selectedDriver(legacy, members, householdMembers, 0)

  if (classification.kind === 'pickup') {
    return {
      classification,
      plan: {
        version: 1,
        source: 'generated',
        waitOnSite: false,
        attendeeRoster: roster,
        legs: [{
          id: `${event.id}:generated:pickup`,
          origin: home,
          destination,
          ...driverFields(outboundDriver),
          passengers,
          purpose: classification.intent === 'dropoff' ? 'dropoff' : 'pickup',
          timing: 'arrive_by',
          time: localTime(event.start_time, timezone),
        }],
      },
    }
  }

  const returnDriver = selectedDriver(legacy, members, householdMembers, 2)
    ?? outboundDriver
  return {
    classification,
    plan: {
      version: 1,
      source: 'generated',
      waitOnSite: legacy?.waits ?? true,
      attendeeRoster: roster,
      legs: [
        {
          id: `${event.id}:generated:outbound`,
          origin: home,
          destination,
          ...driverFields(outboundDriver),
          passengers,
          purpose: 'appointment',
          timing: 'arrive_by',
          time: localTime(event.start_time, timezone),
        },
        {
          id: `${event.id}:generated:return`,
          origin: destination,
          destination: home,
          ...driverFields(returnDriver),
          passengers,
          purpose: 'return',
          timing: 'depart_at',
          time: localTime(event.end_time, timezone),
        },
      ],
    },
  }
}

export function mayReplaceTransportationPlan(plan) {
  return plan == null || plan?.source === 'generated'
}
