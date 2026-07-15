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
      eventType: 'event',
      expectedFollowUp: 'event_follow_up',
      establishedAt: now.toISOString(),
    },
  )
  assert.equal(
    conversationStateAfterCalendarAction('update_event', { id: 'event-2' }, {}, now).activeEventId,
    'event-2',
  )
  assert.equal(
    conversationStateAfterCalendarAction(
      'create_event',
      { event_type: 'reminder' },
      { event_id: 'reminder-1' },
      now,
    ).eventType,
    'reminder',
  )
})

test('confirmed calendar deletes and reminder completions clear stale active-event context', () => {
  for (const tool of ['delete_event', 'complete_reminder']) {
    assert.equal(
      conversationStateAfterCalendarAction(tool, { id: 'event-1' }, {}, now).activeEntityType,
      'none',
    )
  }
})

test('confirmed reminder completion keeps the remaining authoritative reminder list active', () => {
  const previousState = {
    activeEntityType: 'calendar_clarification',
    candidateEvents: [
      { id: 'one', title: 'One', start: null, version: 'v1', eventType: 'reminder' },
      { id: 'two', title: 'Two', start: null, version: 'v2', eventType: 'reminder' },
      { id: 'three', title: 'Three', start: null, version: 'v3', eventType: 'reminder' },
    ],
    pendingMutation: { tool: 'select_event', args: {} },
    expectedFollowUp: 'calendar_clarification',
    establishedAt: new Date('2026-07-14T17:00:00.000Z').toISOString(),
  }
  const remaining = conversationStateAfterCalendarAction(
    'complete_reminder',
    { id: 'one' },
    {},
    now,
    previousState,
  )
  assert.deepEqual(remaining.candidateEvents.map((candidate) => candidate.id), ['two', 'three'])
  assert.equal(remaining.establishedAt, now.toISOString())
})
