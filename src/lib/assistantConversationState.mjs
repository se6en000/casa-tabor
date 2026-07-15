export function conversationStateAfterCalendarAction(tool, args, result, now = new Date(), previousState) {
  const groceryTools = ['check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity']
  if (groceryTools.includes(tool) && previousState?.activeEntityType === 'grocery_clarification') {
    const removesFromActiveList = tool === 'remove_grocery_item' || (tool === 'check_grocery_item' && args?.checked === true)
    const candidates = removesFromActiveList
      ? previousState.candidateGroceryItems.filter((candidate) => candidate.id !== args?.item_id)
      : previousState.candidateGroceryItems.map((candidate) =>
          candidate.id === args?.item_id && typeof result?.item?.updated_at === 'string'
            ? { ...candidate, version: result.item.updated_at }
            : candidate
        )
    if (candidates.length > 1) {
      return {
        ...previousState,
        candidateGroceryItems: candidates,
        establishedAt: now.toISOString(),
      }
    }
    if (candidates.length === 1) {
      return {
        activeEntityType: 'grocery_item',
        activeGroceryItemId: candidates[0].id,
        expectedFollowUp: 'grocery_follow_up',
        establishedAt: now.toISOString(),
      }
    }
  }
  if (groceryTools.includes(tool)) {
    if (tool === 'remove_grocery_item' || (tool === 'check_grocery_item' && args?.checked === true)) {
      return {
        activeEntityType: 'none',
        expectedFollowUp: 'none',
        establishedAt: now.toISOString(),
      }
    }
    if (typeof args?.item_id === 'string') {
      return {
        activeEntityType: 'grocery_item',
        activeGroceryItemId: args.item_id,
        expectedFollowUp: 'grocery_follow_up',
        establishedAt: now.toISOString(),
      }
    }
  }
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
