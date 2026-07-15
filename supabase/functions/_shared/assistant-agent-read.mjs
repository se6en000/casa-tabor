import {
  compareCalendarEvents,
  eventOverlapsCalendarRange,
} from './assistant-event-range.mjs'

const SUPPORTED_READ_TOOLS = new Set([
  'calendar.get_event',
  'calendar.search',
  'calendar.get_range',
  'calendar.check_conflicts',
  'grocery.get_list',
])

export function executeAgentReadTool(toolName, args, data = {}) {
  if (!SUPPORTED_READ_TOOLS.has(toolName)) {
    return { supported: false, code: 'unsupported_read_tool' }
  }
  if (toolName === 'calendar.get_event') return getCalendarEvent(args, data.events)
  if (toolName === 'calendar.search') return searchCalendar(args, data.events)
  if (toolName === 'calendar.get_range') return getCalendarRange(args, data.events)
  if (toolName === 'calendar.check_conflicts') return checkCalendarConflicts(args, data.events)
  return getGroceryList(args, data.groceryItems)
}

export function formatAgentReadResult(toolName, result, options = {}) {
  if (!result?.supported) return null
  if (toolName.startsWith('calendar.')) {
    const events = Array.isArray(result.events) ? result.events : []
    if (toolName === 'calendar.check_conflicts') {
      if (events.length === 0) return 'That time is open—no calendar conflicts found.'
      return `That time overlaps:\n${events.map((event) => `- **${event.title}** — ${formatRange(event, options.utcOffset)}`).join('\n')}`
    }
    const primaryEvents = Array.isArray(result.primaryEvents) ? result.primaryEvents : events
    const helpfulIds = new Set(Array.isArray(options.helpfulEntityIds) ? options.helpfulEntityIds : [])
    const contextEvents = (Array.isArray(result.contextEvents) ? result.contextEvents : [])
      .filter((event) => result.laterContextEventIds?.includes(event.id) || helpfulIds.has(event.id))
    if (toolName === 'calendar.search' && result.eventType === 'reminder') {
      if (primaryEvents.length === 0) return 'I could not find any open reminders.'
      return `${primaryEvents.length} open reminder${primaryEvents.length === 1 ? '' : 's'}:\n${eventLines(primaryEvents, options.utcOffset)}`
    }
    if (primaryEvents.length === 0 && contextEvents.length === 0) return 'Nothing is on the calendar for that request.'
    const primaryText = primaryEvents.length === 0
      ? `Nothing falls directly in ${options.scopeLabel ?? 'that requested time'}.`
      : primaryEvents.length === 1
        ? `**${primaryEvents[0].title}** — ${formatRange(primaryEvents[0], options.utcOffset)}${formatLocation(primaryEvents[0])}`
        : `${primaryEvents.length} events in ${options.scopeLabel ?? 'that time'}:\n${eventLines(primaryEvents, options.utcOffset)}`
    if (contextEvents.length > 0) {
      return `${primaryText}\n\nAlso on that day:\n${eventLines(contextEvents, options.utcOffset)}`
    }
    return primaryText
  }

  const items = Array.isArray(result.items) ? result.items : []
  if (items.length === 0) return 'The grocery list is empty.'
  const direct = `${items.length} grocery item${items.length === 1 ? '' : 's'}:\n${items.map((item) => {
    const quantity = [item.quantity, item.unit].filter(Boolean).join(' ')
    return `- **${item.name}**${quantity ? ` — ${quantity}` : ''}${item.checked ? ' ✓' : ''}`
  }).join('\n')}`
  const helpfulIds = new Set(Array.isArray(options.helpfulEntityIds) ? options.helpfulEntityIds : [])
  const helpfulItems = (Array.isArray(result.contextItems) ? result.contextItems : [])
    .filter((item) => helpfulIds.has(item.id))
    .slice(0, 3)
  return helpfulItems.length === 0
    ? direct
    : `${direct}\n\nAlso useful:\n${helpfulItems.map((item) => `- **${item.name}**${item.checked ? ' ✓' : ''}`).join('\n')}`
}

function searchCalendar(args, rawEvents) {
  const events = normalizeEvents(rawEvents)
  const search = normalizeCalendarSearch(args?.query, args?.event_type)
  const memberName = normalizeText(args?.member_name)
  const range = parseRange(args?.start, args?.end)
  const filtered = events.filter((event) => {
    const title = searchableText(event.title)
    if (search.terms.length > 0 && !search.terms.every((term) => title.includes(term))) return false
    if (memberName && !event.members.some((member) => member.toLowerCase() === memberName)) return false
    if (search.eventType && event.event_type !== search.eventType) return false
    if (range && !overlaps(event, range, args?.utc_offset)) return false
    return true
  })
  filtered.sort((a, b) => compareCalendarEvents(a, b, args?.utc_offset))
  return {
    supported: true,
    events: filtered,
    count: filtered.length,
    eventType: search.eventType || null,
  }
}

function normalizeCalendarSearch(queryValue, eventTypeValue) {
  const query = searchableText(queryValue)
  const explicitType = normalizeText(eventTypeValue)
  const mentionsReminder = /\breminders?\b/.test(query)
  const mentionsEvent = /\b(?:appointments?|events?)\b/.test(query)
  const eventType = ['event', 'reminder'].includes(explicitType)
    ? explicitType
    : mentionsReminder
      ? 'reminder'
      : mentionsEvent
        ? 'event'
        : ''
  const ignored = new Set([
    'a', 'an', 'calendar', 'event', 'events', 'find', 'for', 'me', 'my',
    'appointment', 'appointments', 'please', 'reminder', 'reminders', 'show', 'the',
  ])
  const terms = query.split(' ').filter((term) => term && !ignored.has(term))
  return { eventType, terms }
}

function searchableText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCalendarEvent(args, rawEvents) {
  const id = normalizeText(args?.id)
  if (!id) return { supported: false, code: 'event_id_required' }
  const event = normalizeEvents(rawEvents).find((candidate) => candidate.id.toLowerCase() === id)
  return { supported: true, events: event ? [event] : [], count: event ? 1 : 0 }
}

function getCalendarRange(args, rawEvents) {
  const range = parseRange(args?.start, args?.end)
  if (!range) return { supported: false, code: 'invalid_range' }
  const primaryRange = parseRange(args?.primary_start, args?.primary_end) ?? range
  const memberNames = Array.isArray(args?.member_names)
    ? args.member_names.map(normalizeText).filter(Boolean)
    : []
  const events = normalizeEvents(rawEvents).filter((event) => {
    if (!overlaps(event, range, args?.utc_offset)) return false
    return memberNames.length === 0 ||
      memberNames.some((name) => event.members.some((member) => member.toLowerCase() === name))
  })
  events.sort((a, b) => compareCalendarEvents(a, b, args?.utc_offset))
  const primaryEvents = events.filter((event) => overlaps(event, primaryRange, args?.utc_offset))
  const primaryIds = new Set(primaryEvents.map((event) => event.id))
  const contextEvents = events.filter((event) => !primaryIds.has(event.id))
  const laterContextEventIds = contextEvents
    .filter((event) => Date.parse(event.start_time) >= primaryRange.end)
    .map((event) => event.id)
  return {
    supported: true,
    events,
    primaryEvents,
    contextEvents,
    laterContextEventIds,
    count: primaryEvents.length,
    contextCount: contextEvents.length,
  }
}

function checkCalendarConflicts(args, rawEvents) {
  const range = parseRange(args?.start, args?.end)
  if (!range) return { supported: false, code: 'invalid_range' }
  const ignoredId = normalizeText(args?.ignore_event_id)
  const events = normalizeEvents(rawEvents).filter((event) =>
    !event.all_day &&
    event.event_type !== 'reminder' &&
    event.id.toLowerCase() !== ignoredId &&
    overlaps(event, range, args?.utc_offset),
  )
  return { supported: true, events, count: events.length }
}

function getGroceryList(args, rawItems) {
  const includeChecked = args?.include_checked === true
  const listId = normalizeText(args?.list_id)
  const query = normalizeText(args?.query)
  const eligibleItems = (Array.isArray(rawItems) ? rawItems : [])
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      if (typeof item.id !== 'string' || typeof item.name !== 'string') return []
      return [{
        id: item.id,
        list_id: typeof item.list_id === 'string' ? item.list_id : null,
        name: item.name,
        quantity: typeof item.quantity === 'string' ? item.quantity : null,
        unit: typeof item.unit === 'string' ? item.unit : null,
        checked: item.checked === true,
        updated_at: typeof item.updated_at === 'string' ? item.updated_at : null,
      }]
    })
    .filter((item) =>
      (!listId || item.list_id?.toLowerCase() === listId) &&
      (includeChecked || !item.checked)
    )
  const items = eligibleItems.filter((item) => !query || item.name.toLowerCase().includes(query))
  const itemIds = new Set(items.map((item) => item.id))
  const contextItems = query ? eligibleItems.filter((item) => !itemIds.has(item.id)) : []
  return { supported: true, items, contextItems, count: items.length, contextCount: contextItems.length }
}

function normalizeEvents(rawEvents) {
  return (Array.isArray(rawEvents) ? rawEvents : []).flatMap((event) => {
    if (!event || typeof event !== 'object') return []
    if (
      typeof event.id !== 'string' ||
      typeof event.title !== 'string' ||
      typeof event.start_time !== 'string' ||
      typeof event.end_time !== 'string'
    ) return []
    return [{
      id: event.id,
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: event.all_day === true,
      event_type: event.event_type === 'reminder' ? 'reminder' : 'event',
      location_name: typeof event.location_name === 'string' ? event.location_name : null,
      address: typeof event.address === 'string' ? event.address : null,
      updated_at: typeof event.updated_at === 'string' ? event.updated_at : null,
      members: Array.isArray(event.members)
        ? event.members.filter((member) => typeof member === 'string')
        : Array.isArray(event.event_members)
          ? event.event_members.flatMap((entry) =>
              typeof entry?.family_members?.name === 'string' ? [entry.family_members.name] : [],
            )
          : [],
    }]
  })
}

function parseRange(startValue, endValue) {
  const start = Date.parse(typeof startValue === 'string' ? startValue : '')
  const end = Date.parse(typeof endValue === 'string' ? endValue : '')
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null
}

function overlaps(event, range, utcOffset) {
  return eventOverlapsCalendarRange(event, range, utcOffset)
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function formatRange(event, utcOffset) {
  const start = formatDate(event.start_time, utcOffset, event.all_day)
  if (event.all_day) {
    const endExclusive = shiftToOffset(event.end_time, utcOffset)
    const startDate = shiftToOffset(event.start_time, utcOffset)
    if (startDate && endExclusive) {
      const inclusiveEnd = new Date(endExclusive.getTime() - 1)
      if (
        inclusiveEnd.getUTCFullYear() !== startDate.getUTCFullYear() ||
        inclusiveEnd.getUTCMonth() !== startDate.getUTCMonth() ||
        inclusiveEnd.getUTCDate() !== startDate.getUTCDate()
      ) {
        return `${start} through ${formatDate(inclusiveEnd.toISOString(), '+00:00', true)}, all day`
      }
    }
    return `${start}, all day`
  }
  const end = formatTime(event.end_time, utcOffset)
  return `${start}–${end}`
}

function formatDate(value, utcOffset, allDay) {
  const shifted = shiftToOffset(value, utcOffset)
  if (!shifted) return value
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(allDay ? {} : { hour: 'numeric', minute: '2-digit' }),
    timeZone: 'UTC',
  }).format(shifted)
}

function formatTime(value, utcOffset) {
  const shifted = shiftToOffset(value, utcOffset)
  if (!shifted) return value
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(shifted)
}

function shiftToOffset(value, utcOffset) {
  const timestamp = Date.parse(value)
  const match = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!Number.isFinite(timestamp) || !match) return null
  const minutes = (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
  return new Date(timestamp + minutes * 60000)
}

function formatLocation(event) {
  const location = event.address ?? event.location_name
  return location ? ` at ${location}` : ''
}

function eventLines(events, utcOffset) {
  return events.map((event) =>
    `- **${event.title}** — ${formatRange(event, utcOffset)}${formatLocation(event)}`,
  ).join('\n')
}
