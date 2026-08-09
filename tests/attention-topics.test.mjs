import assert from 'node:assert/strict'
import test from 'node:test'

import { attentionLearningSignature, buildAttentionTopics } from '../src/utils/attentionTopics.ts'

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

test('buildAttentionTopics groups distinct actions for the same event into one decision topic', () => {
  const topics = buildAttentionTopics([
    prep({ id: 'packing', category: 'travel_trips', description: 'Pack overnight bags' }),
    prep({ id: 'payment', category: 'bills_payments', description: 'Pay registration fee' }),
  ])

  assert.equal(topics.length, 1)
  assert.deepEqual(topics[0].itemIds, ['packing', 'payment'])
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

test('buildAttentionTopics groups delivery and payment updates from one vendor message', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'payment',
      event_id: null,
      type: 'payment',
      category: null,
      description: 'Your payment method has been charged for the Walmart order.',
      event_title: 'Delivered: groceries +8 items',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
    }),
    prep({
      id: 'delivery',
      event_id: null,
      type: 'delivery',
      category: null,
      description: 'Your Walmart order has been delivered.',
      event_title: 'Delivered: groceries +8 items',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
    }),
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].transactionVendor, 'Walmart')
  assert.equal(topics[0].item.id, 'delivery')
  assert.deepEqual(topics[0].itemIds, ['payment', 'delivery'])
})

test('buildAttentionTopics keeps one order thread across messages and shows its latest update', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'confirmed',
      event_id: null,
      type: 'delivery',
      description: 'Walmart order #2000151-91693117 is confirmed.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
      created_at: '2026-08-09T12:00:00.000Z',
    }),
    prep({
      id: 'delivered',
      event_id: null,
      type: 'delivery',
      description: 'Your Walmart order #2000151-91693117 was delivered.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-2',
      created_at: '2026-08-09T18:45:00.000Z',
    }),
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].item.id, 'delivered')
  assert.equal(topics[0].transactionVendor, 'Walmart')
})

test('buildAttentionTopics never merges simultaneous orders from the same vendor', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'order-a',
      event_id: null,
      type: 'delivery',
      description: 'Walmart order #2000151-91693117 was delivered.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-a',
    }),
    prep({
      id: 'order-b',
      event_id: null,
      type: 'delivery',
      description: 'Walmart order #2000151-13974456 is out for delivery.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-b',
    }),
  ])

  assert.equal(topics.length, 2)
})

test('buildAttentionTopics links no-id updates by a shared item summary across messages', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'signature',
      event_id: null,
      type: 'delivery',
      event_title: 'Your InHome delivery should arrive by 2:29pm',
      description: 'Signature required for delivery of Cavit Pinot Grigio 1.5... +8 items.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
      created_at: '2026-08-09T18:15:00.000Z',
    }),
    prep({
      id: 'payment',
      event_id: null,
      type: 'payment',
      event_title: 'Delivered: Cavit Pinot Grigio 1.5... +8 items',
      description: 'Your payment method has been charged for the Walmart order.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-2',
      created_at: '2026-08-09T19:00:00.000Z',
    }),
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].item.id, 'payment')
})

test('buildAttentionTopics keeps no-id orders with different item summaries separate', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'wine-order',
      event_id: null,
      type: 'delivery',
      description: 'Delivery of Cavit Pinot Grigio 1.5... +8 items.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
    }),
    prep({
      id: 'grocery-order',
      event_id: null,
      type: 'delivery',
      description: 'Delivery of Great Value Frozen Raw... +17 items.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-2',
    }),
  ])

  assert.equal(topics.length, 2)
})

test('buildAttentionTopics honors structured transaction keys for any vendor', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'target-shipped',
      event_id: null,
      type: 'delivery',
      description: 'Your order shipped.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-1',
      attention_thread_key: 'transaction:target:12345',
      attention_vendor: 'Target',
      created_at: '2026-08-09T12:00:00.000Z',
    }),
    prep({
      id: 'target-delivered',
      event_id: null,
      type: 'delivery',
      description: 'Your order was delivered.',
      source_type: 'gmail',
      source_ref: 'gmail:member:message-2',
      attention_thread_key: 'transaction:target:12345',
      attention_vendor: 'Target',
      created_at: '2026-08-09T15:00:00.000Z',
    }),
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].transactionVendor, 'Target')
  assert.equal(topics[0].item.id, 'target-delivered')
})

test('buildAttentionTopics groups semantically related event titles near the same time', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'email',
      event_id: null,
      type: 'rsvp',
      event_title: 'Lake Lytal Needs Your Help',
      event_date: '2026-08-12T23:30:00.000Z',
      source_type: 'gmail',
      source_ref: 'gmail:message-1',
    }),
    prep({
      id: 'calendar',
      event_id: 'event-board-vote',
      type: 'general_todo',
      event_title: 'Lake Lytal Softball Board Vote',
      event_date: '2026-08-12T22:30:00.000Z',
      source_type: 'calendar_ai',
      source_ref: null,
    }),
  ])

  assert.equal(topics.length, 1)
  assert.deepEqual(topics[0].itemIds, ['email', 'calendar'])
})

test('buildAttentionTopics does not merge generic title overlap on different days', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'practice-one',
      event_id: 'event-one',
      event_title: 'Lake Lytal softball practice',
      event_date: '2026-08-12T22:30:00.000Z',
    }),
    prep({
      id: 'practice-two',
      event_id: 'event-two',
      event_title: 'Lake Lytal softball practice',
      event_date: '2026-08-15T22:30:00.000Z',
    }),
  ])

  assert.equal(topics.length, 2)
})

test('buildAttentionTopics never semantically merges two distinct linked events', () => {
  const topics = buildAttentionTopics([
    prep({
      id: 'practice',
      event_id: 'event-practice',
      event_title: 'Lake Lytal softball practice',
      event_date: '2026-08-12T21:30:00.000Z',
    }),
    prep({
      id: 'game',
      event_id: 'event-game',
      event_title: 'Lake Lytal softball game',
      event_date: '2026-08-12T22:30:00.000Z',
    }),
  ])

  assert.equal(topics.length, 2)
})

test('learned topic rules reunite future matching evidence', () => {
  const email = prep({
    id: 'email',
    event_id: null,
    type: 'rsvp',
    event_title: 'Lake Lytal Needs Your Help',
    event_date: '2026-08-12T23:30:00.000Z',
    source_type: 'gmail',
    source_ref: 'gmail:new-message',
  })
  const calendar = prep({
    id: 'calendar',
    event_id: 'event-board-vote',
    type: 'general_todo',
    event_title: 'Lake Lytal Softball Board Vote',
    event_date: '2026-08-12T22:30:00.000Z',
    source_type: 'calendar_ai',
    source_ref: null,
  })

  const learnedTopicKey = 'learned:lake-lytal-board-vote'
  const topics = buildAttentionTopics([email, calendar], [
    { signature: attentionLearningSignature(email), topic_key: learnedTopicKey },
    { signature: attentionLearningSignature(calendar), topic_key: learnedTopicKey },
  ])

  assert.equal(topics.length, 1)
  assert.equal(topics[0].key, learnedTopicKey)
})

test('a learned separation prevents an automatic semantic merge', () => {
  const first = prep({
    id: 'first',
    event_id: null,
    type: 'rsvp',
    event_title: 'Lake Lytal Needs Your Help',
    event_date: '2026-08-12T23:30:00.000Z',
    source_type: 'gmail',
  })
  const second = prep({
    id: 'second',
    event_id: 'event-board-vote',
    type: 'general_todo',
    event_title: 'Lake Lytal Softball Board Vote',
    event_date: '2026-08-12T22:30:00.000Z',
    source_type: 'calendar_ai',
  })

  const topics = buildAttentionTopics([first, second], [
    { signature: attentionLearningSignature(first), topic_key: 'separate:first' },
  ])

  assert.equal(topics.length, 2)
})
