import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTurnPrompt, readTurnResolution } from '../supabase/functions/_shared/assistant-turn-context.mjs'

// Jake's bug report, 2026-09-30 17:47: "I asked it cancel the softball game tonight, figuring that it would know
// what game to cancel. But it just wanted to change the title … I expected it to say, oh, I'm sorry to hear. Let
// me delete that event." The turn reader called deleting "other" and read the cancel as a change (a title with
// "(CANCELED - rained)"). Now taking one thing off — cancel, call off, rained out, not happening — is "remove":
// the server makes the delete card for the item it names.

test('the reader knows taking something off, in any words, is remove — not a change', () => {
  const p = buildTurnPrompt({ messages: [{ role: 'user', content: 'cancel the softball game tonight. It rained.' }], upcoming: [], family: [] })
  assert.match(p, /- "remove": asks to take one calendar item off/)
  assert.match(p, /rained out/)
  assert.doesNotMatch(p, /\(Deleting is "other"\.\)/)
  assert.match(p, /"called_off": true\|false/)
})

test('remove needs the item; called off is kept', () => {
  assert.deepEqual(
    (({ act, eventId, calledOff }) => ({ act, eventId, calledOff }))(readTurnResolution({ act: 'remove', event_id: 'e1', called_off: true }, { knownIds: ['e1'] })),
    { act: 'remove', eventId: 'e1', calledOff: true })
  assert.equal(readTurnResolution({ act: 'remove', event_id: null }, { knownIds: ['e1'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'remove', event_id: 'made-up' }, { knownIds: ['e1'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'remove', event_id: 'e1' }, { knownIds: ['e1'] }).calledOff, false)
})

test('the server makes the delete card from it, and the card says it kindly and in full', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const i = server.indexOf("} else if (resolution.act === 'remove' && about && !about.repeating) {")
  assert.ok(i > 0 && i < server.indexOf("} else if (resolution.act === 'change' && about && !about.repeating) {"))
  assert.match(server.slice(i, i + 900), /fullAiCard\(\{ name: 'delete_event'/)
  assert.match(server, /Sorry it’s off\. /)
  assert.doesNotMatch(server, /title → "\$\{String\(args\.title\)\.slice\(0, 40\)\}"/)
})
