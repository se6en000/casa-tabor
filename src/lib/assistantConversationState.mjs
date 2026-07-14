export function conversationStateAfterCalendarAction(tool, args, result, now = new Date()) {
  if (tool === 'delete_event') {
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
    expectedFollowUp: 'event_follow_up',
    establishedAt: now.toISOString(),
  }
}
