import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const script = readFileSync(
  new URL('../scripts/ai-agent-live-regression.mjs', import.meta.url),
  'utf8',
)

test('live agent regression covers natural calendar and grocery conversations', () => {
  for (const phrase of [
    'What does Thursday afternoon look like?',
    "Is that the only thing that's happening Thursday afternoon?",
    "There's no softball practice as well",
    'what does thirty afternoon thursday afternoon look like',
    'Delete the late Thursday pickup at 9:15 PM.',
    'Schedule dinner with Mom Sunday around six for an hour and a half.',
    'Mom is Kelly and make it for an hour and a half.',
    'Actually, make that Saturday at ten.',
    'Move it to 6:30 PM that same day.',
    "We're basically out of pears, pita chips, and ricotta—throw those on the list.",
    'Make that two.',
    'Check them off.',
    'Check off sparkling water.',
    'Remove quail eggs from the grocery list.',
  ]) {
    assert.match(script, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('live agent regression executes confirmed calendar continuity while keeping grocery proposals dry', () => {
  assert.match(script, /dry_run: false/)
  assert.match(script, /execute-ai-action/)
  assert.match(script, /confirmedCreate\.response\.tool/)
  assert.match(script, /confirmedCorrection\.response\.tool/)
  assert.match(script, /last_modified_source: 'ios'/)
  assert.doesNotMatch(script, /last_modified_source: 'casa'/)
  assert.match(script, /verifyNoProposalsPersisted/)
  assert.match(script, /groceryItemsRemaining/)
  assert.match(script, /cleanup\.verified/)
  assert.match(script, /Late Thursday pickup/)
  assert.match(script, /helpful later-evening context/)
})
