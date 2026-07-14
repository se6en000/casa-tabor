import { resolveCalendarSemanticTurn } from './assistant-calendar-agent.mjs'

const STATE_TTL_MS = 30 * 60 * 1000

export function normalizeConversationState(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return null
  const establishedAt = typeof value.establishedAt === 'string' ? Date.parse(value.establishedAt) : NaN
  if (!Number.isFinite(establishedAt) || now - establishedAt > STATE_TTL_MS || establishedAt > now + 60000) {
    return null
  }
  if (value.activeEntityType === 'grocery_item') {
    const activeGroceryItemId = typeof value.activeGroceryItemId === 'string' ? value.activeGroceryItemId.trim() : ''
    if (!activeGroceryItemId) return null
    return {
      activeEntityType: 'grocery_item',
      activeGroceryItemId,
      expectedFollowUp: 'grocery_follow_up',
      establishedAt: new Date(establishedAt).toISOString(),
    }
  }
  if (value.activeEntityType === 'calendar_clarification') {
    const candidates = Array.isArray(value.candidateEvents)
      ? value.candidateEvents.slice(0, 6).flatMap((candidate) => {
          const id = typeof candidate?.id === 'string' ? candidate.id.trim() : ''
          if (!id) return []
          return [{
            id,
            title: typeof candidate.title === 'string' ? candidate.title : 'Calendar event',
            start: typeof candidate.start === 'string' ? candidate.start : null,
            version: typeof candidate.version === 'string' ? candidate.version : null,
          }]
        })
      : []
    const pendingMutation = value.pendingMutation
    if (
      candidates.length < 2 ||
      !['update_event', 'delete_event'].includes(pendingMutation?.tool) ||
      !pendingMutation.args ||
      typeof pendingMutation.args !== 'object' ||
      Array.isArray(pendingMutation.args)
    ) return null
    return {
      activeEntityType: 'calendar_clarification',
      candidateEvents: candidates,
      pendingMutation: {
        tool: pendingMutation.tool,
        args: structuredClone(pendingMutation.args),
        ...(pendingMutation.semanticTurn
          ? { semanticTurn: structuredClone(pendingMutation.semanticTurn) }
          : {}),
      },
      expectedFollowUp: 'calendar_clarification',
      establishedAt: new Date(establishedAt).toISOString(),
    }
  }
  if (value.activeEntityType !== 'event') return null
  const activeEventId = typeof value.activeEventId === 'string' ? value.activeEventId.trim() : ''
  if (!activeEventId) return null
  return {
    activeEntityType: 'event',
    activeEventId,
    activeEventUpdatedAt: typeof value.activeEventUpdatedAt === 'string' ? value.activeEventUpdatedAt : null,
    expectedFollowUp: 'event_follow_up',
    establishedAt: new Date(establishedAt).toISOString(),
  }
}

export function groceryConversationState(item, now = new Date()) {
  return {
    activeEntityType: 'grocery_item',
    activeGroceryItemId: item.id,
    expectedFollowUp: 'grocery_follow_up',
    establishedAt: now.toISOString(),
  }
}

export function eventConversationState(event, now = new Date()) {
  return {
    activeEntityType: 'event',
    activeEventId: event.id,
    activeEventUpdatedAt: event.updated_at ?? null,
    expectedFollowUp: 'event_follow_up',
    establishedAt: now.toISOString(),
  }
}

export function calendarClarificationConversationState(candidates, pendingMutation, now = new Date()) {
  return {
    activeEntityType: 'calendar_clarification',
    candidateEvents: candidates.slice(0, 6).map((candidate) => ({
      id: candidate.id,
      title: candidate.title ?? 'Calendar event',
      start: candidate.start ?? candidate.start_time ?? null,
      version: candidate.version ?? candidate.updated_at ?? null,
    })),
    pendingMutation: {
      tool: pendingMutation.tool,
      args: structuredClone(pendingMutation.args ?? {}),
      ...(pendingMutation.semanticTurn
        ? { semanticTurn: structuredClone(pendingMutation.semanticTurn) }
        : {}),
    },
    expectedFollowUp: 'calendar_clarification',
    establishedAt: now.toISOString(),
  }
}

export function resolveCalendarClarificationSelection(text, state, events, options = {}) {
  if (state?.activeEntityType !== 'calendar_clarification') return null
  const input = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const candidates = state.candidateEvents
    .map((candidate) => events.find((event) => event.id === candidate.id))
    .filter(Boolean)
  if (candidates.length === 0) {
    return { text: 'Those calendar choices are no longer available. Please name the event again.' }
  }
  if (/\b(?:choices|options|list|number)\b/.test(input)) {
    return {
      text: `Here are the choices:\n${candidates.map((event, index) =>
        `${index + 1}. ${event.title} — ${formatClarificationStart(event.start_time, options.utcOffset)}`
      ).join('\n')}`,
    }
  }

  let selectedIndex = null
  if (/\b(?:first|1st)\b/.test(input)) selectedIndex = 0
  else if (/\b(?:second|2nd)\b/.test(input)) selectedIndex = 1
  else if (/\b(?:third|3rd)\b/.test(input)) selectedIndex = 2
  else if (/\b(?:last|latest)\b/.test(input)) selectedIndex = candidates.length - 1
  else if (/\b(?:earlier|morning)\b/.test(input)) selectedIndex = 0
  else if (/\b(?:later|afternoon|evening|night)\b/.test(input)) selectedIndex = candidates.length - 1
  if (selectedIndex == null) {
    selectedIndex = candidateIndexBySpokenTime(input, candidates, options.utcOffset)
  }
  if (selectedIndex == null) {
    selectedIndex = candidateIndexByWeekday(input, candidates, options.utcOffset)
  }

  const selected = selectedIndex == null ? null : candidates[selectedIndex]
  if (!selected) return null
  const pending = state.pendingMutation
  if (pending.semanticTurn) {
    const result = resolveCalendarSemanticTurn({
      ...pending.semanticTurn,
      targetEntityId: selected.id,
      candidateEntityIds: [],
    }, {
      currentDate: options.currentDate ?? new Date().toISOString(),
      utcOffset: options.utcOffset,
      activeEntity: { type: 'event', id: selected.id },
      authoritativeEntities: events.map((event) => ({
        type: 'event',
        id: event.id,
        title: event.title,
        version: event.updated_at,
        start: event.start_time,
        end: event.end_time,
        allDay: event.all_day === true,
      })),
    })
    if (result.kind !== 'tool') {
      return { text: 'I could not safely prepare that change. Please describe it again.' }
    }

    return {
      tool: result.toolName === 'calendar.delete' ? 'delete_event' : 'update_event',
      args: result.args,
      event: selected,
    }
  }
  if (pending.tool === 'delete_event') {
    return {
      tool: 'delete_event',
      args: { id: selected.id, title: selected.title },
      event: selected,
    }
  }
  return {
    tool: 'update_event',
    args: {
      ...pending.args,
      id: selected.id,
      expected_updated_at: selected.updated_at,
    },
    event: selected,
  }
}

function candidateIndexBySpokenTime(input, candidates, utcOffset) {
  const hourWords = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  }
  const match = input.match(/\b(?:at|starting at|starts? at)\s+(?:(\d{1,2})(?::(\d{2}))?|([a-z]+))\s*(a\.?m\.?|p\.?m\.?)?\b/i)
  if (!match) return null
  const hour12 = match[1] ? Number(match[1]) : hourWords[match[3]]
  const minute = match[2] ? Number(match[2]) : 0
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12 || minute > 59) return null
  const period = match[4]?.toLowerCase().startsWith('p') ? 'pm'
    : match[4]?.toLowerCase().startsWith('a') ? 'am'
      : null
  const matches = candidates.flatMap((event, index) => {
    const local = localDateParts(event.start_time, utcOffset)
    if (!local || local.minute !== minute || local.hour % 12 !== hour12 % 12) return []
    if (period && (local.hour >= 12 ? 'pm' : 'am') !== period) return []
    return [index]
  })
  return matches.length === 1 ? matches[0] : null
}

function candidateIndexByWeekday(input, candidates, utcOffset) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const requested = weekdays.find((weekday) => new RegExp(`\\b${weekday}\\b`).test(input))
  if (!requested) return null
  const matches = candidates.flatMap((event, index) => {
    const local = localDateParts(event.start_time, utcOffset)
    return local?.weekday === requested ? [index] : []
  })
  return matches.length === 1 ? matches[0] : null
}

function formatClarificationStart(value, utcOffset) {
  const local = localDateParts(value, utcOffset)
  if (!local) return String(value ?? 'unknown time')
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(local.date)
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(local.date)
  return `${date} at ${time}`
}

function localDateParts(value, utcOffset) {
  const timestamp = Date.parse(String(value ?? ''))
  const match = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!Number.isFinite(timestamp) || !match) return null
  const offset = (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
  const date = new Date(timestamp + offset * 60000)
  return {
    date,
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()],
  }
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

export function answerGroundedEventFollowUp(text, event, formatTime = (value) => value) {
  if (!event) return null
  const input = String(text ?? '').trim()
  const title = event.title || 'that event'
  const location = event.location_name || event.location || null
  const address = event.address || null
  const enrichment = Array.isArray(event.event_enrichments) ? event.event_enrichments[0] : event.event_enrichments
  const members = list(event.event_members).map((entry) => entry?.family_members?.name).filter(Boolean)

  if (/^(?:yes|yeah|yep|correct|right)(?:[,\s]+that(?:'s| is)\s+(?:the\s+)?one)?(?:[,\s]+(?:obviously|exactly))?[.!]?$/i.test(input)) {
    return `Got it—I'm using the calendar event "${title}" for this conversation.`
  }
  if (/\b(?:right|correct|actual|calendar)\s+location\b|\bare you sure\b.*\blocation\b/i.test(input)) {
    return location
      ? `According to the calendar, "${title}" is at ${location}${address ? `, ${address}` : ''}.`
      : `The calendar does not have a location saved for "${title}".`
  }
  if (/\b(?:what(?:'s| is)\s+the\s+)?address\b/i.test(input)) {
    return address
      ? `The calendar address for "${title}" is ${address}.`
      : `The calendar does not have an address saved for "${title}".`
  }
  if (/\b(?:where|location|venue)\b/i.test(input)) {
    return location
      ? `"${title}" is at ${location}${address ? `, ${address}` : ''}.`
      : `The calendar does not have a location saved for "${title}".`
  }
  if (/\bhow long\b.*\b(?:event|party|appointment|meeting)\b|\bhow long (?:is|does) (?:it|that) (?:last|run)\b/i.test(input)) {
    const start = Date.parse(event.start_time)
    const end = Date.parse(event.end_time)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return `The calendar does not have a valid duration saved for "${title}".`
    }
    const totalMins = Math.round((end - start) / 60000)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    const duration = [hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : null, mins ? `${mins} minutes` : null]
      .filter(Boolean)
      .join(' ')
    return `"${title}" lasts ${duration}.`
  }
  if (/\b(?:what time|when|start|end)\b/i.test(input)) {
    return `"${title}" runs from ${formatTime(event.start_time)} to ${formatTime(event.end_time)}.`
  }
  if (/\b(?:who|attend|coming|members?)\b/i.test(input)) {
    return members.length
      ? `${members.join(', ')} ${members.length === 1 ? 'is' : 'are'} attached to "${title}" in the calendar.`
      : `No family members are attached to "${title}" in the calendar.`
  }
  if (/\b(?:bring|prepare|prep|details?|tell me about|talk about)\b/i.test(input)) {
    const facts = [
      `${formatTime(event.start_time)} to ${formatTime(event.end_time)}`,
      location ? `at ${location}${address ? `, ${address}` : ''}` : null,
      event.description ? `calendar note: ${event.description}` : null,
      enrichment?.prep_notes ? `prep note: ${enrichment.prep_notes}` : null,
      list(enrichment?.what_to_bring).length ? `bring: ${list(enrichment.what_to_bring).join(', ')}` : null,
    ].filter(Boolean)
    return `For "${title}", the calendar shows ${facts.join('; ')}.`
  }
  return null
}

export function answerGroundedEventSemanticFrame(frame, event, formatTime = (value) => value) {
  const canonicalByIntent = {
    'event.location': 'where is it',
    'event.address': "what's the address",
    'event.time': 'what time does it start and end',
    'event.duration': 'how long does the event last',
    'event.attendees': 'who is attending',
    'event.preparation': 'prepare me with the details and what to bring',
  }
  const canonical = canonicalByIntent[frame?.intent]
  return canonical ? answerGroundedEventFollowUp(canonical, event, formatTime) : null
}
