import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fullAiCard } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// The Oct 4 report: "set the location for Husky softball practice … to Lake Lytle" when the practice wasn't on the
// calendar — a change offered for nothing, then a dead end. Now what a change is about is read again right before it
// is proposed (past the three weeks held), and a thing that isn't there is said plainly, with an offer to add it.
const ctx = { events: [{ id: 'e1', title: 'Liv dentist', start_time: '2026-10-07T16:00:00Z', end_time: '2026-10-07T17:00:00Z', all_day: false }], utcOffset: '-04:00', now: new Date('2026-10-05T12:00:00-04:00') }

test('a change to something not on the calendar says so and offers to add it', () => {
  assert.deepEqual(fullAiCard({ name: 'update_event', args: { id: 'nope', place: 'Lake Lytle' } }, ctx), { error: "I don't see that on the calendar yet. Want me to add it?" })
  assert.deepEqual(fullAiCard({ name: 'delete_event', args: { id: 'nope' } }, ctx), { error: "I don't see that on the calendar, so there's nothing to remove." })
  assert.equal(fullAiCard({ name: 'update_event', args: { id: 'e1', place: 'Lake Lytle' } }, ctx).tool, 'update_event')
})

test('before the check, a target outside the three weeks is read from the calendar (not deleted, not cancelled)', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const i = server.indexOf('const unseen = parts')
  assert.ok(i > 0 && i < server.indexOf('const changes = parts.filter'))
  assert.match(server, /from\('events'\)\.select\('id'\)\.in\('id', unseen\)\.is\('deleted_at', null\)\.neq\('status', 'cancelled'\)/)
})
