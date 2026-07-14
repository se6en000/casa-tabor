import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationStateAfterCalendarAction } from '../src/lib/assistantConversationState.mjs'

const now = new Date('2026-07-14T18:00:00.000Z')

test('confirmed calendar creates and updates establish the resulting event as active', () => {
  assert.deepEqual(
    conversationStateAfterCalendarAction(
      'create_event',
      {},
      { event_id: 'event-1', event_updated_at: 'v1' },
      now,
    ),
    {
      activeEntityType: 'event',
      activeEventId: 'event-1',
      activeEventUpdatedAt: 'v1',
      expectedFollowUp: 'event_follow_up',
      establishedAt: now.toISOString(),
    },
  )
  assert.equal(
    conversationStateAfterCalendarAction('update_event', { id: 'event-2' }, {}, now).activeEventId,
    'event-2',
  )
})

test('confirmed calendar deletes clear stale active-event context', () => {
  assert.equal(
    conversationStateAfterCalendarAction('delete_event', { id: 'event-1' }, {}, now).activeEntityType,
    'none',
  )
})
