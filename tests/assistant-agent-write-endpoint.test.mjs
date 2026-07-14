import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync(
  new URL('../supabase/functions/ai-agent-write/index.ts', import.meta.url),
  'utf8',
)

test('agent write endpoint proposes additive and exact calendar updates through policy', () => {
  assert.match(endpoint, /planner_mode: 'additive_write'/)
  assert.match(endpoint, /evaluateAgentToolCall/)
  assert.match(endpoint, /calendar\.create/)
  assert.match(endpoint, /calendar\.update/)
  assert.match(endpoint, /grocery\.add_items/)
  assert.match(endpoint, /acceptedDecision/)
  assert.match(endpoint, /type: 'tool_action'/)
})

test('agent write endpoint never executes or exposes destructive capabilities', () => {
  assert.doesNotMatch(endpoint, /execute-ai-action/)
  assert.doesNotMatch(endpoint, /\.from\(['"](?:events|grocery_items)['"]\)\.(?:insert|update|delete)/)
  assert.doesNotMatch(endpoint, /calendar\.delete/)
  assert.doesNotMatch(endpoint, /grocery\.remove_item/)
})

test('agent write endpoint checks duplicates and emits proposal telemetry', () => {
  assert.match(endpoint, /findAgentCalendarDuplicates/)
  assert.match(endpoint, /isAgentCalendarUpdateTargetUnambiguous/)
  assert.match(endpoint, /server_agent_write_proposal/)
  assert.match(endpoint, /server_agent_write_fallback/)
  assert.match(endpoint, /lane: 'agent_write'/)
})

test('active event updates narrow planner context without weakening policy context', () => {
  assert.match(endpoint, /activeAuthoritativeEntity/)
  assert.match(endpoint, /planningEntities/)
  assert.match(endpoint, /authoritativeEntities: planningEntities/)
  assert.match(endpoint, /authoritativeEntities,\n\s+duplicateCandidates/)
})
