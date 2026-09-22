import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-22: root architectural gap behind the "add"/"add event" 504s (see
// tests/bare-add-fast-path.test.mjs for the deterministic-lane fix for that
// exact repro). The agent-write and agent-read speculative plan calls race
// against HARDCODED timeouts (6500ms, 4500ms) that completely ignore
// remainingRequestBudgetMs() -- the same budget guard `callModel` already
// respects everywhere else in this file. Combined, 6500+4500=11000ms exceeds
// the entire 9000ms NORMAL_REQUEST_HARD_TIMEOUT_MS on its own, before context
// load or the primary call ever run. A message that isn't a literal bare
// "add" (so the fast path doesn't catch it) but still isn't cleanly plannable
// -- causing both agent-write and agent-read to run close to their ceiling --
// can still exhaust the whole budget with zero chance for the primary call.
const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')

function raceBlock(marker) {
  const idx = source.indexOf(marker)
  assert.ok(idx >= 0, `marker not found: ${marker}`)
  return source.slice(idx - 300, idx + 50)
}

test('agent-write race timeout leaves a budget floor for context load + the primary call, not a bare constant', () => {
  const block = raceBlock("resolve({ data: null, error: { message: 'agent_write_timeout' } })")
  assert.match(block, /remainingRequestBudgetMs\(\)/)
  assert.doesNotMatch(block, /setTimeout\(\(\) => resolve\(\{ data: null, error: \{ message: 'agent_write_timeout' \} \}\), 6500\)/)
})

test('agent-read race timeout leaves a budget floor for context load + the primary call, not a bare constant', () => {
  const block = raceBlock("resolve({ data: null, error: { message: 'agent_read_timeout' } })")
  assert.match(block, /remainingRequestBudgetMs\(\)/)
  assert.doesNotMatch(block, /setTimeout\(\(\) => resolve\(\{ data: null, error: \{ message: 'agent_read_timeout' \} \}\), 4500\)/)
})

test('the reserved floor is a named constant, not a magic number, and is large enough for a real primary call attempt', () => {
  assert.match(source, /MIN_BUDGET_RESERVE_AFTER_AGENT_PLAN_MS\s*=\s*(\d+)/)
  const value = Number(source.match(/MIN_BUDGET_RESERVE_AFTER_AGENT_PLAN_MS\s*=\s*(\d+)/)[1])
  // Measured live: primary generation calls run p50 ~940ms / p90 ~2169ms
  // (ai_provider_calls, function_name=ai-assistant, call_purpose=generation).
  // The floor must comfortably cover a p90 call plus context load.
  assert.ok(value >= 2000 && value <= 5000, `reserve floor ${value}ms should be in a sane 2000-5000ms range`)
})

test('a near-zero remaining budget clamps the agent-plan race timeout to a non-negative value (never a negative setTimeout delay)', () => {
  const block = raceBlock("resolve({ data: null, error: { message: 'agent_write_timeout' } })")
  assert.match(block, /Math\.max\(0,/)
})
