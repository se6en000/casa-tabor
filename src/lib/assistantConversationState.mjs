export function conversationStateAfterCalendarAction(tool, args, result, now = new Date(), previousState) {
  if (tool === 'complete_reminder' && previousState?.activeEntityType === 'calendar_clarification') {
    const remaining = previousState.candidateEvents.filter((candidate) => candidate.id !== args?.id)
    if (remaining.length > 1) {
      return {
        ...previousState,
        candidateEvents: remaining,
        establishedAt: now.toISOString(),
      }
    }
    if (remaining.length === 1) {
      return {
        activeEntityType: 'event',
        activeEventId: remaining[0].id,
        activeEventUpdatedAt: remaining[0].version ?? null,
        eventType: remaining[0].eventType === 'reminder' ? 'reminder' : 'event',
        expectedFollowUp: 'event_follow_up',
        establishedAt: now.toISOString(),
      }
    }
  }
  if (['delete_event', 'complete_reminder'].includes(tool)) {
    return {
      activeEntityType: 'none',
      expectedFollowUp: 'none',
      establishedAt: now.toISOString(),
    }
  }
  if (!['create_event', 'update_event'].includes(tool)) return undefined
  const eventId = typeof result?.event_id === 'string'
    ? result.event_id
    : typeof args?.id === 'string'
      ? args.id
      : null
  if (!eventId) return undefined
  return {
    activeEntityType: 'event',
    activeEventId: eventId,
    activeEventUpdatedAt: typeof result?.event_updated_at === 'string'
      ? result.event_updated_at
      : null,
    eventType: args?.event_type === 'reminder' ? 'reminder' : 'event',
    expectedFollowUp: 'event_follow_up',
    establishedAt: now.toISOString(),
  }
}
