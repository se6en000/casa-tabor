import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldImportGoogleItem, INSTANCE_HORIZON_DAYS } from '../supabase/functions/_shared/google-sync-window.mjs'

// Found 2026-09-27: a yearly birthday added in Google came into Casa as 73 separate events,
// one per year through 2099. The change feed (sync token) lists every copy of a repeating event
// with no end, and nothing limited it. Copies more than about a year out are left to the series
// (materialized from its rule); a one-off far in the future still comes in.
const now = Date.parse('2026-09-27T12:00:00Z')
const allDay = (date, extra = {}) => ({ start: { date }, end: { date }, ...extra })
const copy = (date) => allDay(date, { recurringEventId: 'p8qqn5abgbgcp9nu5uvh2b9coc' })

test('copies of a repeating event come in up to about a year out, not to 2099', () => {
  assert.equal(shouldImportGoogleItem(copy('2027-01-23'), now, false), true)
  assert.equal(shouldImportGoogleItem(copy('2027-09-20'), now, false), true)
  assert.equal(shouldImportGoogleItem(copy('2028-01-23'), now, false), false)
  assert.equal(shouldImportGoogleItem(copy('2099-01-23'), now, false), false)
  assert.ok(INSTANCE_HORIZON_DAYS >= 366, 'next year\'s birthday is always in reach')
})

test('a one-off far in the future still comes in; a full rescan keeps its own window', () => {
  assert.equal(shouldImportGoogleItem(allDay('2028-06-01'), now, false), true)
  assert.equal(shouldImportGoogleItem(allDay('2028-06-01'), now, true), false)
  assert.equal(shouldImportGoogleItem(allDay('2026-10-10'), now, true), true)
})

test('the calendar sync uses it on every path', () => {
  const inbound = readFileSync(new URL('../supabase/functions/sync-calendars/index.ts', import.meta.url), 'utf8')
  assert.match(inbound, /from '\.\.\/_shared\/google-sync-window\.mjs'/)
  assert.equal((inbound.match(/shouldImportGoogleItem\(/g) ?? []).length, 2)
})
