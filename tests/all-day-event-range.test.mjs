import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAllDayRangeLabel, normalizeAllDayEventRange } from '../src/utils/allDayEventRange.ts'

test('normalizeAllDayEventRange preserves multi-day all-day spans', () => {
  assert.deepEqual(normalizeAllDayEventRange('2026-07-21T00:00', '2026-07-28T23:59'), {
    start: '2026-07-21T00:00:00.000Z',
    end: '2026-07-28T23:59:59.000Z',
  })
})

test('normalizeAllDayEventRange clamps end before start to the same day', () => {
  assert.deepEqual(normalizeAllDayEventRange('2026-07-21T00:00', '2026-07-20T23:59'), {
    start: '2026-07-21T00:00:00.000Z',
    end: '2026-07-21T23:59:59.000Z',
  })
})

test('formatAllDayRangeLabel shows a full multi-day range', () => {
  assert.equal(formatAllDayRangeLabel('2026-07-21T00:00', '2026-07-28T23:59'), 'Tue, Jul 21 – Tue, Jul 28 · All day')
})
