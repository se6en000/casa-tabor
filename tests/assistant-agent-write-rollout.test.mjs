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
  assert.match(assistant, /'check_grocery_item'/)
  assert.match(assistant, /'update_grocery_item_quantity'/)
  assert.match(assistant, /'agent\.write\.update'/)
  assert.match(assistant, /'agent\.write\.additive'/)
  assert.match(assistant, /server_agent_write_adopted/)
})

test('write rollout forwards exact active grocery context and versions', () => {
  assert.match(assistant, /context\?\.page === 'grocery'/)
  assert.match(assistant, /activeConversationGroceryItem/)
  assert.match(assistant, /activeGroceryItemId/)
  assert.match(assistant, /version: activeConversationGroceryItem\.updated_at/)
  assert.match(assistant, /notes, updated_at/)
})

test('write rollout falls through to authoritative reads after non-write plans', () => {
  assert.match(assistant, /server_agent_write_fallback/)
  assert.match(assistant, /agentWriteData\?\.code/)
  assert.match(assistant, /agent_write_timeout/)
  assert.match(assistant, /shouldRunAgentRead = !dryRun/)
  assert.match(assistant, /shouldRunAgentShadow = !shouldRunAgentWrite && !shouldRunAgentRead/)
})
