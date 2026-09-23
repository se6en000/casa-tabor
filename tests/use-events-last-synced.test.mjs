import assert from 'node:assert/strict'
import test from 'node:test'

import { formatLastSyncedLabel } from '../src/hooks/useEventsLastSynced.ts'

// Pure formatting logic for the calendar's "last synced" indicator --
// crucial for the stale-while-revalidate UX so a household member glancing
// at the calendar can tell whether they're looking at fresh data or a
// snapshot from before a hiccup, rather than trusting stale data blindly.

test('while a fetch is in flight, shows a syncing state regardless of when data last landed', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime()
  assert.equal(formatLastSyncedLabel({ isFetching: true, dataUpdatedAt: now - 5000, now }), 'Syncing…')
})

test('no data yet at all (first-ever load, nothing restored, nothing fetched) renders nothing', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime()
  assert.equal(formatLastSyncedLabel({ isFetching: false, dataUpdatedAt: 0, now }), null)
})

test('a very recent sync reads as "just now" rather than a jarring "0 seconds ago"', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime()
  assert.equal(formatLastSyncedLabel({ isFetching: false, dataUpdatedAt: now - 2000, now }), 'Updated just now')
})

test('an older sync reads as a relative time, so a stale-while-revalidate reload is honestly labeled', () => {
  const now = new Date('2026-09-23T12:10:00Z').getTime()
  const label = formatLastSyncedLabel({ isFetching: false, dataUpdatedAt: now - 1000 * 60 * 6, now })
  assert.match(label, /^Updated .*ago$/)
})
