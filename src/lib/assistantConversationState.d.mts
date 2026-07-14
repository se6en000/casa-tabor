export type CalendarActionConversationState =
  | {
      activeEntityType: 'event'
      activeEventId: string
      activeEventUpdatedAt: string | null
      expectedFollowUp: 'event_follow_up'
      establishedAt: string
    }
  | {
      activeEntityType: 'none'
      expectedFollowUp: 'none'
      establishedAt: string
    }

export function conversationStateAfterCalendarAction(
  tool: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  now?: Date,
): CalendarActionConversationState | undefined
