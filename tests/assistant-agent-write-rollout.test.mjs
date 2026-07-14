import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('additive agent writes are feature flagged and sampled', () => {
  assert.match(assistant, /agent_write_config/)
  assert.match(assistant, /agentWriteConfig\?\.enabled === true/)
  assert.match(assistant, /Math\.random\(\) < agentWriteRate/)
  assert.match(assistant, /\['calendar', 'grocery'\]\.includes/)
  assert.match(assistant, /!context\?\.pendingAction/)
})

test('write rollout adopts only allowlisted proposal actions', () => {
  assert.match(assistant, /agentWriteData\?\.supported === true/)
  assert.match(assistant, /agentWriteData\.type === 'tool_action'/)
  assert.match(assistant, /\['create_event', 'add_grocery_items'\]\.includes/)
  assert.match(assistant, /semantic_intent: 'agent\.write\.additive'/)
  assert.match(assistant, /server_agent_write_adopted/)
})

test('write rollout retains legacy fallback and isolates read sampling', () => {
  assert.match(assistant, /server_agent_write_fallback/)
  assert.match(assistant, /agent_write_timeout/)
  assert.match(assistant, /shouldRunAgentRead = !shouldRunAgentWrite/)
  assert.match(assistant, /shouldRunAgentShadow = !shouldRunAgentWrite && !shouldRunAgentRead/)
})
