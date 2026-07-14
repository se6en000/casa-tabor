import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const runner = readFileSync(new URL('../scripts/ai-agent-shadow-qa.mjs', import.meta.url), 'utf8')

test('agent shadow QA covers reads, writes, corrections, and safety boundaries', () => {
  for (const scenario of [
    'calendar-day-list',
    'grocery-list',
    'recipe-substitute',
    'calendar-create',
    'calendar-update',
    'calendar-delete',
    'pending-create-correction',
    'ambiguous-delete',
    'targetless-change',
  ]) {
    assert.match(runner, new RegExp(`['"]${scenario}['"]`), scenario)
  }
})

test('agent shadow QA cannot invoke the action executor or mutate fixtures', () => {
  assert.doesNotMatch(runner, /execute-ai-action/)
  assert.doesNotMatch(runner, /\.from\(['"]events['"]\).*(?:insert|update|delete)/s)
  assert.match(runner, /functions\/v1\/ai-agent-shadow/)
})

test('agent shadow QA reports outcome accuracy, latency, and tokens', () => {
  assert.match(runner, /categories/)
  assert.match(runner, /accuracy/)
  assert.match(runner, /p50/)
  assert.match(runner, /p95/)
  assert.match(runner, /totalTokens/)
  assert.match(runner, /plannerSteps/)
  assert.match(runner, /simulatedReadResult/)
})
