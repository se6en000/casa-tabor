import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAttentionTopics } from '../src/utils/attentionTopics.ts'

function prep(overrides) {
  return {
    id: 'prep-1',
    event_id: 'event-1',
    type: 'general_todo',
    category: 'general_todo',
    emoji: '!',
    description: 'Prepare for the event',
    event_title: 'Family event',
    event_date: '2026-08-12T15:00:00.000Z',
    due_by: '2026-08-11T15:00:00.000Z',
    priority: 2,
    dismissed: false,
    dismissed_at: null,
    created_at: '2026-08-09T12:00:00.000Z',
    source_type: 'calendar_ai',
    source_ref: null,
    ...overrides,
  }
}

test('buildAttentionTopics keeps distinct actions for the same event separate', () => {
  const topics = buildAttentionTopics([
    prep({ id: 'packing', category: 'travel_trips', description: 'Pack overnight bags' }),
    prep({ id: 'payment', category: 'bills_payments', description: 'Pay registration fee' }),
  ])

  assert.equal(topics.length, 2)
  assert.deepEqual(topics.map((topic) => topic.itemIds), [['packing'], ['payment']])
})

test('buildAttentionTopics merges recreated missed reminders for the same topic and time window', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'original-reminder',
      event_id: null,
      source_type: 'reminder_missed',
      source_ref: 'event-original',
      event_title: 'Bring violin folder',
      event_date: '2026-08-10T14:00:00.000Z',
    }),
    prep({
      id: 'snoozed-reminder',
      event_id: null,
      source_type: 'reminder_missed',
      source_ref: 'event-created-by-snooze',
      event_title: 'Bring violin folder',
      event_date: '2026-08-10T14:10:00.000Z',
    }),
  ])

  assert.equal(topics.length, 1)
  assert.deepEqual(topics[0].itemIds, ['original-reminder', 'snoozed-reminder'])
})

test('buildAttentionTopics selects the urgent representative and exposes unique source evidence', () => {
  const topics = buildAttentionTopics([
    prep({ id: 'calendar', source_type: 'calendar_ai', priority: 1 }),
    prep({ id: 'email', source_type: 'gmail', source_ref: 'gmail:message-1', priority: 3 }),
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].item.id, 'email')
  assert.deepEqual(topics[0].sourceTypes, ['calendar_ai', 'gmail'])
  assert.deepEqual(topics[0].prepItemIds, ['calendar', 'email'])
})
