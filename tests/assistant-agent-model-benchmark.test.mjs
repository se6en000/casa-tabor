import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  MODEL_BENCHMARK_CORPUS_VERSION,
  MODEL_BENCHMARK_SCENARIOS,
} from '../scripts/ai-agent-model-benchmark-corpus.mjs'

test('model benchmark corpus is frozen, substantial, and fully auditable', () => {
  assert.equal(MODEL_BENCHMARK_CORPUS_VERSION, 'casa-natural-v1')
  assert.equal(MODEL_BENCHMARK_SCENARIOS.length, 20)
  assert.equal(new Set(MODEL_BENCHMARK_SCENARIOS.map((item) => item.key)).size, 20)
  for (const item of MODEL_BENCHMARK_SCENARIOS) {
    assert.ok(item.messages.length > 0, item.key)
    assert.ok(item.expectation.length > 20, item.key)
    assert.ok(item.expectedKinds.length > 0 || item.expectedTools.length > 0, item.key)
  }
})

test('model benchmark includes natural variation, corrections, ambiguity, and cross-domain context', () => {
  const transcript = MODEL_BENCHMARK_SCENARIOS
    .flatMap((item) => item.messages.map((message) => message.content))
    .join('\n')
  assert.match(transcript, /Actually nine\. Sorry\./)
  assert.match(transcript, /tomoro mornin/)
  assert.match(transcript, /the one from before/i)
  assert.match(transcript, /Move soccer later, add milk/)
  assert.ok(MODEL_BENCHMARK_SCENARIOS.some((item) => item.messages.length >= 3))
  assert.ok(MODEL_BENCHMARK_SCENARIOS.filter((item) => item.category === 'safety').length >= 5)
  assert.ok(MODEL_BENCHMARK_SCENARIOS.filter((item) => item.category === 'correction').length >= 2)
})

test('exact mutation scenarios ground expected IDs and versions', () => {
  const exactMutations = MODEL_BENCHMARK_SCENARIOS.filter((item) =>
    item.expectedTools.some((tool) => ['calendar.update', 'grocery.update_item'].includes(tool))
  )
  assert.ok(exactMutations.length >= 3)
  for (const item of exactMutations) {
    assert.ok(item.context.authoritativeEntities?.length > 0, item.key)
    assert.equal(typeof item.context.authoritativeEntities[0].version, 'string', item.key)
    assert.equal(typeof item.validate, 'function', item.key)
  }
})

test('core benchmark excludes cooking while retaining calendar and grocery safety', () => {
  const core = MODEL_BENCHMARK_SCENARIOS.filter((item) => item.category !== 'cooking')
  assert.equal(core.length, 18)
  assert.ok(core.some((item) => item.key === 'ambiguous-calendar-delete'))
  assert.ok(core.some((item) => item.key === 'duplicate-grocery-target'))
  assert.ok(core.every((item) => item.page !== 'cooking'))
})

test('benchmark gates the production semantic endpoints', () => {
  const source = readFileSync(
    new URL('../scripts/ai-agent-model-benchmark.mjs', import.meta.url),
    'utf8',
  )
  assert.match(source, /ai-agent-read/)
  assert.match(source, /ai-agent-write/)
  assert.match(source, /production-semantic-endpoints/)
  assert.match(source, /2026-07-14T13:00:00\.000Z/)
  assert.match(source, /release_gate_passed/)
  assert.match(source, /process\.exitCode = 1/)
  assert.doesNotMatch(source, /functions\/v1\/ai-agent-shadow/)
})
