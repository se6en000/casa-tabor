import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('agent reads are feature flagged, sampled, and limited to read surfaces', () => {
  assert.match(assistant, /agent_read_config/)
  assert.match(assistant, /agentReadConfig\?\.enabled === true/)
  assert.match(assistant, /Math\.random\(\) < agentReadRate/)
  assert.match(assistant, /\['calendar', 'grocery'\]\.includes/)
  assert.match(assistant, /!context\?\.pendingAction/)
})

test('agent read rollout adopts only explicit supported text results', () => {
  assert.match(assistant, /agentReadData\?\.supported === true/)
  assert.match(assistant, /agentReadData\.type === 'text'/)
  assert.match(assistant, /semantic_intent: 'agent\.read'/)
  assert.match(assistant, /server_agent_read_adopted/)
})

test('agent read failures retain the current authoritative fallback path', () => {
  assert.match(assistant, /server_agent_read_fallback/)
  assert.match(assistant, /agent_read_timeout/)
  assert.match(assistant, /shouldRunAgentShadow = !shouldRunAgentRead/)
})
