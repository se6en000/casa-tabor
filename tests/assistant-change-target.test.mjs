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

// Bug reports 21296d2d / 92d41098 (Oct 1: "Can you use the location of the orthodontist appointment to fix the name?");
// replayed Oct 5 it changed the place to the place's name. The reader is told the name is the title, and naming it after
// its place leaves the place alone (live replays: three wordings rename it; "it's at the Wellington office now" still
// moves it).
test('the reader knows an item\'s name is its title, and naming it after its place keeps the place', async () => {
  const { buildTurnPrompt } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'use the location to fix the name' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-10-05T14:00:00Z' })
  assert.match(prompt, /The item's "name" is its "title"/)
  assert.match(prompt, /the place stays as it is; "place" changes only when it's somewhere else/)
})

// Nightly check, Oct 6: "I finished order groceries for travel" was read as a change (a change card) or left to the
// model (which once said it was done without doing it). Finishing a listed to-do is its own act: the done card.
test('the reader’s “done”: a listed to-do finished becomes the done card’s act; nothing listed goes on to the model', async () => {
  const { readTurnResolution, buildTurnPrompt } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  assert.equal(readTurnResolution({ act: 'done', event_id: 'todo-1' }, { knownIds: ['todo-1'] }).act, 'done')
  assert.equal(readTurnResolution({ act: 'done', event_id: null }, { knownIds: ['todo-1'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'done', event_id: 'unknown' }, { knownIds: ['todo-1'] }).act, 'other')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'I finished order groceries for travel' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-10-06T14:00:00Z' })
  assert.match(prompt, /"done": says a to-do or reminder is finished/)
  assert.match(prompt, /Finishing is never a "change"/)
})
