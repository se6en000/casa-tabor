import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { promisesAction } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Open bug 8f58eddc (2026-09-30): the full model sometimes promises instead of calling its tool — "I'll set that
// up for you" with no card; "I'll remember that you want to look at a pergola" with nothing saved (Casa's memory,
// dry runs). A reply that promises an action with no tool called gets one more turn: call it now, or say plainly
// that nothing was saved.
test('words that promise an action, and words that don’t', () => {
  for (const said of [
    'I can remind you to call the orthodontist tomorrow, October 1st. I’ll set that up for you',
    'I can take milk off the grocery list for you. Just say yes when you’re ready for the card.',
    "I'll remember that you want to look at a pergola in the spring.",
    'Okay, I’ll forget that Liv played for Team Fury in the summer.',
    'I would forget that Liv played for Team Fury in the summer.',
    "Okay, I'll remember that Liv also does debate on Thursdays.",
    "I'll create a card for you to confirm.",
    'Let me add that to the grocery list.',
    'I’ll set up a reminder for you tomorrow to call McCranels Orthodontics.',
  ]) assert.equal(promisesAction(said), true, said)
  for (const said of [
    'Liv goes to Bak Middle School of the Arts.',
    'Want me to add it to the calendar?',
    'Tomorrow, Thursday, October 1, is the field trip.',
    'I don’t have anything on Liv’s volleyball team.',
    "I'll need the address first — what is it?",
  ]) assert.equal(promisesAction(said), false, said)
})

test('the loop sends a promise with no tool back once', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /if \(!nudgedPromise && !memoryCalls\.length && \(promisesAction\(words\) \|\| lookOnly\)/)
  assert.match(server, /nothing has happened yet/)
})

test('sent back, the model must call a tool that acts — never a lookup, never words alone', async () => {
  const { fullAiRequest, fullAiTools } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const req = fullAiRequest({ system: 's', contents: [], tools: fullAiTools({ planning: false }), mustAct: true })
  assert.equal(req.tool_config.function_calling_config.mode, 'ANY')
  const names = req.tool_config.function_calling_config.allowed_function_names
  for (const n of ['remember', 'forget', 'create_event', 'add_todo', 'remove_grocery_item']) assert.ok(names.includes(n), n)
  for (const n of ['search_web', 'find_events', 'show_day', 'think_it_through']) assert.ok(!names.includes(n), n)
  assert.equal(fullAiRequest({ system: 's', contents: [], tools: fullAiTools({ planning: false }) }).tool_config.function_calling_config.mode, 'AUTO')
})

test('an empty first answer is retried for words once — the tools stay on for the rounds after it', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /retryAfterEmpty: wordsOnlyNext,/)
  assert.doesNotMatch(server, /retryAfterEmpty: retriedEmpty/)
  assert.match(server, /wordsOnlyNext = false/)
})

// Oct 5, live dry runs: "what's the weather at Olympia Park in Wellington tomorrow?" → "Let me check the weather for
// you." and nothing more; "…in Wellington this afternoon?" → "I can look up the weather for Wellington, Florida, this
// afternoon." A lookup promised and not done is sent back once, and that time it must look something up.
import { promisesLookup, fullAiRequest as request, fullAiTools as toolsFor } from '../supabase/functions/_shared/assistant-full-ai.mjs'
test('a lookup promised and not done', () => {
  for (const said of ['Let me check the weather for you.', 'I can look up the weather for Wellington, Florida, this afternoon.', "I'll find out when the game starts.", 'Let me look that up.'])
    assert.equal(promisesLookup(said), true, said)
  for (const said of ['It will be 84° and sunny in Wellington.', 'Should I check the weather for the game?', "I can't look that up right now.", 'Liv has practice at 5.'])
    assert.equal(promisesLookup(said), false, said)
})
test('sent back for a lookup, the model may only look things up', () => {
  const req = request({ system: 's', contents: [], tools: toolsFor({ planning: false }), mustAct: 'look' })
  assert.equal(req.tool_config.function_calling_config.mode, 'ANY')
  assert.ok(req.tool_config.function_calling_config.allowed_function_names.includes('get_weather_forecast'))
  assert.ok(!req.tool_config.function_calling_config.allowed_function_names.includes('create_event'))
})
