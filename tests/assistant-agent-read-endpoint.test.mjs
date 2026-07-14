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
