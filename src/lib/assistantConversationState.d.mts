export type CalendarActionConversationState =
  | {
      activeEntityType: 'event'
      activeEventId: string
      activeEventUpdatedAt?: string | null
      eventType?: 'event' | 'reminder'
      expectedFollowUp: 'event_follow_up'
      establishedAt: string
    }
  | CalendarClarificationConversationState
  | GroceryActionConversationState
  | {
      activeEntityType: 'none'
      expectedFollowUp: 'none'
      establishedAt: string
    }

export type CalendarClarificationConversationState = {
  activeEntityType: 'calendar_clarification'
  candidateEvents: Array<{
    id: string
    title: string
    start: string | null
    version: string | null
    eventType?: 'event' | 'reminder'
  }>
  pendingMutation: {
    tool: 'select_event' | 'update_event' | 'delete_event' | 'complete_reminder'
    args: Record<string, unknown>
    semanticTurn?: Record<string, unknown>
  }
  expectedFollowUp: 'calendar_clarification'
  establishedAt: string
}

export type GroceryActionConversationState =
  | {
      activeEntityType: 'grocery_item'
      activeGroceryItemId: string
      expectedFollowUp: 'grocery_follow_up'
      establishedAt: string
    }
  | {
      activeEntityType: 'grocery_clarification'
      candidateGroceryItems: Array<{
        id: string
        name: string
        version: string | null
      }>
      expectedFollowUp: 'grocery_clarification'
      establishedAt: string
    }

export function conversationStateAfterCalendarAction(
  tool: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  now?: Date,
  previousState?: Record<string, unknown>,
): CalendarActionConversationState | undefined
