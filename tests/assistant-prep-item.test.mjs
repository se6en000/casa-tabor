import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { FULL_AI_TOOLS, fullAiCard } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Bug report 2026-09-29 2:13 PM: "For tomorrow's get and pack, can you add check Olivia's softball shoes to
// make sure they are dry?" became a to-do, then an all-day event — never a line on the game's list. Jake,
// 2026-09-30: nobody says "get and pack" — "dry Liv's cleats", "make sure you find Owen's pink kindergarten
// shirt". Getting something ready for an upcoming event (check, dry, find, pack, bring, charge, wash, sign)
// is a line on that event's get & pack list, on a yes.
const events = [
  { id: 'ev-softball', title: 'Softball: Huskies @ Wellington Knights', start_time: '2026-10-03T14:00:00-04:00', end_time: '2026-10-03T16:00:00-04:00', event_type: 'event' },
  { id: 'ev-trip', title: "Field Trip: Ballet Palm Beach's production of Peter and the Wolf", start_time: '2026-10-01T09:30:00-04:00', end_time: '2026-10-01T12:00:00-04:00', event_type: 'event' },
]
const ctx = { events, utcOffset: '-04:00', now: new Date('2026-09-30T14:00:00Z') }

test('Casa can put a thing to get ready on an event’s get & pack list (a card, saved on a yes)', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'add_prep_item')
  assert.ok(tool)
  assert.match(tool.description, /dry Liv.s cleats|find Owen.s pink/i)
  assert.deepEqual(fullAiCard({ name: 'add_prep_item', args: { event_id: 'ev-softball', item: 'Dry Liv’s cleats' } }, ctx), { tool: 'add_prep_item', args: { event_id: 'ev-softball', label: 'Dry Liv’s cleats', event_title: 'Softball: Huskies @ Wellington Knights', event_start: '2026-10-03T14:00:00-04:00' } })
  assert.match(fullAiCard({ name: 'add_prep_item', args: { event_id: 'nope', item: 'x' } }, ctx).error, /which event/i)
  assert.match(fullAiCard({ name: 'add_prep_item', args: { event_id: 'ev-trip', item: ' ' } }, ctx).error, /what to get ready/i)
})

test('the turn reader hears it without the words "get and pack", and the server makes the card', async () => {
  const { buildTurnPrompt, readTurnResolution } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Make sure Liv’s cleats are dry for Saturday' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' })
  assert.match(prompt, /"prep":/)
  assert.deepEqual(readTurnResolution({ act: 'other', prep: { item: 'Dry Liv’s cleats', event_id: 'ev-softball' } }, { knownIds: ['ev-softball'] }).prep, { item: 'Dry Liv’s cleats', eventId: 'ev-softball' })
  assert.equal(readTurnResolution({ act: 'other', prep: { item: 'x', event_id: 'made-up' } }, { knownIds: ['ev-softball'] }).prep, null, 'only an event on the calendar')
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /semantic_intent: 'conversation\.prep_item'/)
  assert.ok(server.indexOf('} else if (resolution.prep) {') < server.indexOf("} else if (resolution.act === 'add') {"), 'a get-ready line wins over a plain add')
  assert.match(server, /'add_prep_item'/)
  const action = fs.readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  assert.match(action, /tool === 'add_prep_item'/)
  assert.match(action, /from\('event_checklist_items'\)\s*\.insert/)
})
