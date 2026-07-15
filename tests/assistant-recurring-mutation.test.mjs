import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRecurringDetailMutation,
  buildRecurringSeriesPatch,
  parseExplicitRecurrenceScope,
  resolvePendingRecurringScope,
  scopeCanonicalMutation,
} from '../supabase/functions/_shared/assistant-recurring-mutation.mjs'

const recurringEvent = {
  id: 'event-1',
  title: 'Soccer practice',
  start_time: '2026-07-20T20:00:00.000Z',
  updated_at: '2026-07-16T12:00:00.000Z',
  series_id: 'series-1',
  record_kind: 'occurrence',
  series_revision_applied: 7,
  original_start_time: '2026-07-20T20:00:00.000Z',
}

test('parses only explicit Outlook-style recurrence scopes', () => {
  assert.equal(parseExplicitRecurrenceScope('just this one'), 'this')
  assert.equal(parseExplicitRecurrenceScope('this event and all following events'), 'future')
  assert.equal(parseExplicitRecurrenceScope('apply it to the entire series'), 'all')
  assert.equal(parseExplicitRecurrenceScope('move soccer to five'), null)
})

test('canonical mutations clarify omitted scope and preserve explicit scope metadata', () => {
  const mutation = {
    tool: 'update_event',
    args: {
      id: recurringEvent.id,
      expected_updated_at: recurringEvent.updated_at,
      title: 'Soccer training',
    },
    event: recurringEvent,
  }

  const clarification = scopeCanonicalMutation('rename it soccer training', mutation, recurringEvent)
  assert.match(clarification.text, /only this event, this and following events, or the entire series/i)
  assert.equal(clarification.tool, undefined)
  assert.equal(clarification.pendingMutation.tool, 'update_event')

  const resumed = resolvePendingRecurringScope(
    'this and following events',
    { pendingMutation: clarification.pendingMutation },
    recurringEvent,
  )
  assert.equal(resumed.tool, 'update_event')
  assert.equal(resumed.args.recurrence_scope, 'future')

  const scoped = scopeCanonicalMutation(
    'rename it soccer training for the entire series',
    mutation,
    recurringEvent,
  )
  assert.equal(scoped.tool, 'update_event')
  assert.equal(scoped.args.recurrence_scope, 'all')
  assert.equal(scoped.args.expected_series_revision, 7)
})

test('builds a reusable detail patch without copying occurrence progress', () => {
  const context = {
    effective_bundle: {
      event: {
        title: 'Soccer practice',
        description: null,
        start_time: '2026-07-20T20:00:00.000Z',
        end_time: '2026-07-20T21:00:00.000Z',
        all_day: false,
        event_type: 'event',
        location_name: 'Field',
        address: '1 Main St',
        lat: 1,
        lng: 2,
      },
      members: [{ family_member_id: 'member-1', role: 'primary' }],
      enrichment: { category: 'sports' },
      checklist_items: [{ id: 'check-1', event_id: 'event-1', label: 'Water', checked: true }],
      action_items: [{ id: 'action-1', event_id: 'event-1', title: 'Pack', completed: true, due_date: '2026-07-20T19:00:00Z' }],
    },
  }
  const normalized = {
    eventUpdates: { title: 'Soccer training' },
    enrichmentUpdates: {},
    checklistItems: undefined,
    actionItems: undefined,
    destinationChanged: false,
    changedEventFields: ['title'],
  }

  const result = buildRecurringDetailMutation(context, normalized)
  assert.deepEqual(result.changedPaths, ['event.title'])
  assert.equal(result.detailPatch.event.title, 'Soccer training')
  assert.equal(result.detailPatch.event.duration_ms, 3600000)
  assert.deepEqual(result.detailPatch.assignments, [{ family_member_id: 'member-1', role: 'primary' }])
  assert.deepEqual(result.detailPatch.checklist_definitions, [{ label: 'Water' }])
  assert.deepEqual(result.detailPatch.action_definitions, [{ title: 'Pack' }])
})

test('future scope truncates the parent rule and preserves the child rule', () => {
  const context = {
    series: {
      timezone: 'America/New_York',
      recurrence_lines: ['RRULE:FREQ=WEEKLY;COUNT=20', 'EXDATE:20260727T200000Z'],
    },
  }
  const patch = buildRecurringSeriesPatch(context, 'future', recurringEvent)
  assert.equal(patch.timezone, 'America/New_York')
  assert.deepEqual(patch.future_recurrence_lines, context.series.recurrence_lines)
  assert.match(patch.original_recurrence_lines[0], /UNTIL=20260720T195959Z/)
  assert.equal(patch.original_recurrence_lines[1], 'EXDATE:20260727T200000Z')
})
