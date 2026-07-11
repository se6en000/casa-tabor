import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCalendarDayRead } from '../supabase/functions/_shared/assistant-calendar-read.mjs'
import { resolveBringListEdit } from '../supabase/functions/_shared/assistant-event-list-edit.mjs'
import { resolveUniqueEventTitle } from '../supabase/functions/_shared/assistant-event-selection.mjs'

const party = {
  id: 'party',
  title: 'Owen 6th Birthday Party',
  start_time: '2026-07-11T16:30:00Z',
  end_time: '2026-07-11T18:30:00Z',
  updated_at: 'v1',
  event_enrichments: [{ what_to_bring: [] }],
}
const pool = {
  id: 'pool',
  title: 'Jake | Family Pool Party @ Uncle Marks',
  start_time: '2026-07-12T18:00:00Z',
  end_time: '2026-07-12T22:00:00Z',
  updated_at: 'v2',
  location_name: "Uncle Mark's House",
}

test('strong event-title language selects one authoritative event', () => {
  assert.equal(resolveUniqueEventTitle("Let's prepare for Owen's birthday party", [pool, party])?.id, 'party')
  assert.equal(resolveUniqueEventTitle('talk about the party', [pool, party]), null)
})

test('tomorrow schedule reads are deterministic and local-date correct', () => {
  const result = resolveCalendarDayRead("what's on the schedule for tomorrow", [party, pool], {
    now: new Date('2026-07-11T13:30:00Z'),
    utcOffset: '-04:00',
  })
  assert.equal(result?.events.length, 1)
  assert.equal(result?.events[0].id, 'pool')
  assert.match(result?.text, /One thing.*tomorrow/)
  assert.match(result?.text, /2:00 PM/)
  assert.doesNotMatch(result?.text, /Soccer Practice|Yoga Class/)
})

test('active event bring-list edits preserve and extend the complete list', () => {
  const first = resolveBringListEdit('add to the list to bring cookies whipped cream', party)
  assert.deepEqual(first?.args.what_to_bring, ['cookies', 'whipped cream'])
  const second = resolveBringListEdit('candles', party, {
    pendingAction: { tool: 'update_event', args: first.args },
  })
  assert.deepEqual(second?.args.what_to_bring, ['cookies', 'whipped cream', 'candles'])
})

test('bring-list corrections revise the pending draft', () => {
  const result = resolveBringListEdit("cookies not cookie", party, {
    pendingAction: {
      tool: 'update_event',
      args: { id: 'party', expected_updated_at: 'v1', what_to_bring: ['cookie', 'whipped cream'] },
    },
  })
  assert.deepEqual(result?.args.what_to_bring, ['whipped cream', 'cookies'])
})
