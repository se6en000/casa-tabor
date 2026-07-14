import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync(
  new URL('../supabase/functions/ai-agent-read/index.ts', import.meta.url),
  'utf8',
)

test('agent read endpoint delegates language planning and executes only approved reads', () => {
  assert.match(endpoint, /functions\.invoke\('ai-agent-shadow'/)
  assert.match(endpoint, /planner_mode: 'authoritative_read'/)
  assert.match(endpoint, /planner\?\.policy\?\.decision !== 'execute'/)
  assert.match(endpoint, /planner\?\.telemetry\?\.tool_effect !== 'read'/)
  assert.match(endpoint, /executeAgentReadTool/)
  assert.match(endpoint, /formatAgentReadResult/)
})

test('agent read endpoint cannot invoke the write executor', () => {
  assert.doesNotMatch(endpoint, /execute-ai-action/)
  assert.doesNotMatch(endpoint, /\.from\(['"](?:events|grocery_items)['"]\)\.(?:insert|update|delete)/)
})

test('agent read endpoint emits explicit success and fallback telemetry', () => {
  assert.match(endpoint, /server_agent_read_result/)
  assert.match(endpoint, /server_agent_read_fallback/)
  assert.match(endpoint, /lane: 'agent_read'/)
})

test('agent read endpoint marks mutation deferrals as safely handled', () => {
  assert.match(endpoint, /handledMutation/)
  assert.match(endpoint, /plan\?\.reason === 'mutation'/)
  assert.match(endpoint, /Nothing was saved/)
})

test('single grocery reads establish authoritative follow-up state', () => {
  assert.match(endpoint, /body\?\.context\?\.groceryQuery/)
  assert.match(endpoint, /toolResult\.items\?\.length === 1/)
  assert.match(endpoint, /activeEntityType: 'grocery_item'/)
  assert.match(endpoint, /activeGroceryItemId: toolResult\.items\[0\]\.id/)
})

test('semantic calendar scope retrieves broad context while preserving the primary range', () => {
  assert.match(endpoint, /body\?\.context\?\.calendarReadContext\?\.start/)
  assert.match(endpoint, /calendarReadContext\.contextStart/)
  assert.match(endpoint, /primary_start: calendarReadContext\.start/)
  assert.match(endpoint, /primary_end: calendarReadContext\.end/)
  assert.match(endpoint, /trustedReadOverride/)
  assert.match(endpoint, /trusted_semantic_read/)
})
