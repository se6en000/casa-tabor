import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fullAiRequest } from '../supabase/functions/_shared/assistant-full-ai.mjs'

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

// Oct 5: the old path is gone (Jake said yes to the Oct 4 plan: the safety net stepped in 14 times in a week and never
// rescued a turn; none after Oct 3). D has nothing to hand back to: an empty or late answer says so plainly.
test('no hand-back: an empty or late answer says so, and nothing runs after D', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runFullAi = async'), src.indexOf('const runPipeline = async'))
  assert.doesNotMatch(src, /hybrid_handback|mayHandBack|handBack/)
  assert.match(run, /couldNotAnswer = \{ status: 200, payload: \{ type: 'text', text: 'Sorry, I lost my train of thought there\. Can you say that again\?'/)
  assert.match(run, /if \(!text\) return couldNotAnswer/)
  assert.match(run, /no answer within[\s\S]{0,120}return couldNotAnswer/)
  const pipeline = src.slice(src.indexOf('const runPipeline = async'))
  assert.match(pipeline, /const answered = await runFullAi\(buildDisplayText\)\n  return \{ \.\.\.answered, payload: \{ \.\.\.answered\.payload, layer: 'hybrid' \} \}/)
})
