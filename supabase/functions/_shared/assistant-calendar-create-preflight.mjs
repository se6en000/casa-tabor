const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'event', 'for', 'from', 'in', 'is', 'it',
  'my', 'of', 'on', 'our', 'the', 'to', 'with',
])

const GENERIC_ACTION_WORDS = new Set([
  'submit', 'order', 'reminder', 'appointment', 'appt', 'meeting', 'call',
  'schedule', 'task', 'pickup', 'pick', 'dropoff', 'drop', 'check', 'pay',
  'buy', 'get', 'visit', 'go',
])

function normalizeTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleTokens(value) {
  return normalizeTitle(value)
    .split(' ')
    .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token))
}

function titleSimilarity(left, right) {
  const leftToks = titleTokens(left)
  const rightToks = titleTokens(right)
  const leftTokens = new Set(leftToks)
  const rightTokens = new Set(rightToks)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token))
  const union = new Set([...leftTokens, ...rightTokens])
  const jaccard = intersection.length / union.size

  // Check if both sides contain distinctive non-generic entity tokens that contradict each other
  // e.g. "Cosco" vs "Walmart", "Leo" vs "Maya", "Soccer" vs "Piano"
  const leftDistinct = [...leftTokens].filter((t) => !rightTokens.has(t) && !GENERIC_ACTION_WORDS.has(t))
  const rightDistinct = [...rightTokens].filter((t) => !leftTokens.has(t) && !GENERIC_ACTION_WORDS.has(t))
  if (leftDistinct.length > 0 && rightDistinct.length > 0) {
    return 0
  }

  return jaccard
}

function eventType(value) {
  return value === 'reminder' ? 'reminder' : 'event'
}

function interval(value) {
  const start = Date.parse(String(value?.start ?? value?.start_time ?? ''))
  const end = Date.parse(String(value?.end ?? value?.end_time ?? ''))
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null
}

function overlapMinutes(left, right) {
  if (!left || !right) return 0
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start)) / 60000
}

function eventMemberNames(event) {
  const rows = Array.isArray(event?.event_members)
    ? event.event_members
    : Array.isArray(event?.members)
      ? event.members
      : []
  return rows.flatMap((row) => {
    const name = row?.family_members?.name ?? row?.family_member?.name ?? row?.name
    return typeof name === 'string' && name.trim() ? [name.trim().toLowerCase()] : []
  })
}

function compactEvent(event) {
  return {
    id: event.id,
    title: event.title,
    start_time: event.start_time,
    end_time: event.end_time,
  }
}

export function assessCalendarCreatePreflight(events, args) {
  const candidates = Array.isArray(events) ? events : []
  const proposedInterval = interval(args)
  const proposedType = eventType(args?.event_type)
  const exactDuplicate = candidates.find((event) =>
    eventType(event?.event_type) === proposedType &&
    normalizeTitle(event?.title) === normalizeTitle(args?.title) &&
    Date.parse(String(event?.start_time ?? '')) === proposedInterval?.start
  )
  if (exactDuplicate) {
    return {
      status: 'exact_duplicate',
      exactDuplicate: compactEvent(exactDuplicate),
      probableDuplicates: [],
      conflicts: [],
    }
  }

  const isReminder = proposedType === 'reminder'
  const duplicateThreshold = isReminder ? 0.85 : 0.65

  const probableDuplicates = candidates.filter((event) => {
    if (eventType(event?.event_type) !== proposedType) return false
    const existingInterval = interval(event)
    const nearby = proposedInterval && existingInterval &&
      Math.abs(proposedInterval.start - existingInterval.start) <= 2 * 60 * 60 * 1000
    if (!nearby) return false
    return titleSimilarity(event?.title, args?.title) >= duplicateThreshold
  })

  const requestedMembers = new Set(
    (Array.isArray(args?.members) ? args.members : [])
      .map((name) => String(name).trim().toLowerCase())
      .filter(Boolean),
  )

  // Reminders never cause or have calendar conflicts.
  // Events only conflict if the SAME family member is double-booked across overlapping non-reminder events.
  const conflicts = isReminder
    ? []
    : candidates.filter((event) => {
        if (eventType(event?.event_type) === 'reminder') return false
        if (overlapMinutes(proposedInterval, interval(event)) <= 15) return false
        const existingMembers = eventMemberNames(event)
        if (requestedMembers.size > 0 && existingMembers.length > 0) {
          return existingMembers.some((name) => requestedMembers.has(name))
        }
        return false
      })

  return {
    status: probableDuplicates.length > 0 || conflicts.length > 0
      ? 'requires_confirmation'
      : 'clear',
    exactDuplicate: null,
    probableDuplicates: probableDuplicates.map(compactEvent),
    conflicts: conflicts.map(compactEvent),
  }
}
