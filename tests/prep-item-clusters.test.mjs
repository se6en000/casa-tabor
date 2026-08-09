import assert from 'node:assert/strict'
import test from 'node:test'

import { clusterPrepItems } from '../src/utils/prepItemClusters.ts'

test('clusterPrepItems collapses same-event prep items into one visible card', () => {
  const clusters = clusterPrepItems([
    {
      id: 'calendar-a',
      event_id: 'event-1',
      type: 'medical',
      emoji: '📋',
      description: 'Calendar alert',
      event_title: 'Well Child Check',
      event_date: '2026-08-10T15:30:00.000Z',
      due_by: '2026-08-10T15:30:00.000Z',
      priority: 2,
      dismissed: false,
      dismissed_at: null,
      created_at: '2026-08-01T10:00:00.000Z',
      source_type: 'calendar_ai',
      source_ref: 'calendar-source',
    },
    {
      id: 'reminder-a',
      event_id: 'event-1',
      type: 'reminder',
      emoji: '🔔',
      description: 'Reminder alert',
      event_title: 'Well Child Check',
      event_date: '2026-08-10T15:30:00.000Z',
      due_by: '2026-08-10T15:30:00.000Z',
      priority: 2,
      dismissed: false,
      dismissed_at: null,
      created_at: '2026-08-01T11:00:00.000Z',
      source_type: 'reminder_manual',
      source_ref: 'event-1',
    },
    {
      id: 'other',
      event_id: 'event-2',
      type: 'general_todo',
      emoji: '📝',
      description: 'Different item',
      event_title: 'Another Event',
      event_date: '2026-08-12T15:30:00.000Z',
      due_by: '2026-08-12T15:30:00.000Z',
      priority: 1,
      dismissed: false,
      dismissed_at: null,
      created_at: '2026-08-01T12:00:00.000Z',
      source_type: 'calendar_ai',
      source_ref: 'calendar-source-2',
    },
  ])

  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].item.id, 'calendar-a')
  assert.deepEqual(clusters[0].itemIds, ['calendar-a', 'reminder-a'])
  assert.equal(clusters[0].relatedCount, 1)
  assert.equal(clusters[1].item.id, 'other')
})
