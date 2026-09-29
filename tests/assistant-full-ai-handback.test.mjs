import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fullAiRequest, mayHandBack, HANDBACK_MIN_MS } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// P3.25 phase 1 (Plan it with Casa): Jake's 9:12 AM turn, 2026-09-29 — "Let's talk about setting up
// the Halloween decorations this year." Gemini answered with nothing twice (8 s), D handed the turn
// back to the old path with its 9 s budget already spent, and the old path's model call failed at
// 0 ms with a 504: "Casa AI took too long to respond."

const system = 'You are Casa.'
const contents = [{ role: 'user', parts: [{ text: "Let's talk about setting up the Halloween decorations this year." }] }]

test('a normal round offers the tools and lets the model choose', () => {
  const body = fullAiRequest({ system, contents, tools: [{ name: 'add_todo' }] })
  assert.deepEqual(body.tools, [{ function_declarations: [{ name: 'add_todo' }] }])
  assert.equal(body.tool_config.function_calling_config.mode, 'AUTO')
  assert.equal(body.system_instruction.parts[0].text, system)
})

test('after an empty answer, the retry asks for words: tools off, and it must not claim a change', () => {
  const body = fullAiRequest({ system, contents, tools: [{ name: 'add_todo' }], retryAfterEmpty: true })
  assert.equal(body.tool_config.function_calling_config.mode, 'NONE')
  const text = body.system_instruction.parts[0].text
  assert.ok(text.startsWith(system))
  assert.match(text, /answer in words/i)
  assert.match(text, /don.t say .*(added|changed|saved)/i)
})

test('the turn goes back to the old path only while the old path still has time to answer', () => {
  assert.equal(mayHandBack(0), false, 'the 9:12 case: nothing left')
  assert.equal(mayHandBack(HANDBACK_MIN_MS - 1), false)
  assert.equal(mayHandBack(HANDBACK_MIN_MS), true)
  assert.ok(HANDBACK_MIN_MS >= 3000, 'the old path needs context load plus a model call')
})

test('ai-assistant uses both: every hand-back is checked against the time left, and the empty retry asks for words', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runFullAi = async'), src.indexOf('const runPipeline = async'))
  assert.ok(run.length > 1000)
  assert.doesNotMatch(run, /if \(handBack\) return null/, 'no hand-back without checking the time left')
  assert.doesNotMatch(run, /if \(!text && handBack\) return null/)
  assert.match(run, /mayHandBack\(remainingRequestBudgetMs\(\)\)/)
  assert.match(run, /fullAiRequest\(\{ system, contents, tools: fullAiTools\(\{ planning \}\), retryAfterEmpty: retriedEmpty/)
  assert.match(run, /finishReason/, 'the empty report says why Gemini stopped')
})

// Held-out run, 2026-09-29: "Help me figure out Liv's birthday party" — the planning model looked up
// the notes, the calendar, the gift ideas and the web, ran out of rounds with a lookup still asked for,
// and said "Sorry, I lost my train of thought there." The last round always answers in words.
test('the last round asks for an answer with what has been found: tools off', () => {
  const body = fullAiRequest({ system, contents, tools: [{ name: 'search_web' }], finalRound: true })
  assert.equal(body.tool_config.function_calling_config.mode, 'NONE')
  assert.match(body.system_instruction.parts[0].text, /answer now/i)
})

test('ai-assistant gives the model up to five rounds, the last one for words', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runFullAi = async'), src.indexOf('const runPipeline = async'))
  assert.match(run, /const FULL_AI_ROUNDS = 5/)
  assert.match(run, /finalRound: round === FULL_AI_ROUNDS - 1/)
})
