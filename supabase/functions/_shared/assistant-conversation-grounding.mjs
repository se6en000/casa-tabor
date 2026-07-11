const STATE_TTL_MS = 30 * 60 * 1000

export function normalizeConversationState(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || value.activeEntityType !== 'event') return null
  const activeEventId = typeof value.activeEventId === 'string' ? value.activeEventId.trim() : ''
  const establishedAt = typeof value.establishedAt === 'string' ? Date.parse(value.establishedAt) : NaN
  if (!activeEventId || !Number.isFinite(establishedAt) || now - establishedAt > STATE_TTL_MS || establishedAt > now + 60000) {
    return null
  }
  return {
    activeEntityType: 'event',
    activeEventId,
    activeEventUpdatedAt: typeof value.activeEventUpdatedAt === 'string' ? value.activeEventUpdatedAt : null,
    expectedFollowUp: 'event_follow_up',
    establishedAt: new Date(establishedAt).toISOString(),
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

  if (/^(?:yes|yeah|yep|correct|right)(?:[,\s]+that(?:'s| is)\s+(?:the\s+)?one)?[.!]?$/i.test(input)) {
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
