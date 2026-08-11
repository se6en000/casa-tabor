import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildReadToolSynthesisContents,
  readToolResultFound,
  readToolSynthesisInstruction,
  shouldExposeSynthesisTools,
  shouldSynthesizeReadTool,
} from '../supabase/functions/_shared/assistant-read-tool-synthesis.mjs'

const assistantSource = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('result counts mark web and place searches as successful', () => {
  assert.equal(readToolResultFound({ count: 5, results: [{ title: 'Result' }] }), true)
  assert.equal(readToolResultFound({ count: 0, results: [] }), false)
})

test('successful web searches require a conversational synthesis turn', () => {
  assert.equal(shouldSynthesizeReadTool({
    name: 'search_web',
    resultFound: true,
    secondaryDepth: 0,
    remainingBudgetMs: 9000,
  }), true)
})

test('web synthesis answers the question from sources instead of returning a result count', () => {
  assert.match(
    readToolSynthesisInstruction('search_web'),
    /answer the user's actual question/i,
  )
  assert.doesNotMatch(
    readToolSynthesisInstruction('search_web'),
    /enumerate.*events/i,
  )
})

test('read-only synthesis cannot call another tool and collapse back to a result count', () => {
  assert.equal(shouldExposeSynthesisTools({ userLikelyRequestedWrite: false }), false)
  assert.equal(shouldExposeSynthesisTools({ userLikelyRequestedWrite: true }), true)
})

test('read-only synthesis receives plain evidence without function-call history', () => {
  const contents = buildReadToolSynthesisContents({
    contents: [{ role: 'user', parts: [{ text: 'What do Bimini hotels cost?' }] }],
    functionCallPart: { functionCall: { name: 'search_web', args: { query: 'Bimini hotels' } } },
    name: 'search_web',
    toolResult: { count: 1, results: [{ title: 'Hotel', url: 'https://example.com', snippet: '$250' }] },
    exposeTools: false,
  })

  assert.equal(contents.length, 2)
  assert.match(contents[1].parts[0].text, /completed search_web/i)
  assert.doesNotMatch(JSON.stringify(contents), /functionCall|functionResponse/)
})

test('ai-assistant wires read results into one bounded tool-free synthesis call', () => {
  assert.match(assistantSource, /shouldSynthesizeReadTool\(\{/)
  assert.match(assistantSource, /readToolSynthesisInstruction\(name,/)
  assert.match(assistantSource, /buildReadToolSynthesisContents\(\{/)
  assert.match(assistantSource, /const synthesisTools = exposeSynthesisTools \? secondaryTools : \[\]/)
  assert.match(assistantSource, /thinking:[\s\S]{0,100}\{ kind: 'level', value: 'low' \}/)
})
