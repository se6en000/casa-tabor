import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('agent reads are feature flagged, sampled, and limited to read surfaces', () => {
  assert.match(assistant, /agent_read_config/)
  assert.match(assistant, /agent_runtime_config/)
  assert.match(assistant, /kill_switch/)
  assert.match(assistant, /default_with_kill_switch/)
  assert.match(assistant, /agentReadConfig\?\.enabled === true/)
  assert.match(assistant, /Math\.random\(\) < agentReadRate/)
  assert.match(assistant, /AGENT_GENERAL_PAGES\.has/)
  assert.match(assistant, /context\?\.assistant_mode !== 'chef'/)
  assert.match(assistant, /!context\?\.pendingAction/)
})

test('explicit reminder creates cannot enter the generic read lane', () => {
  const readGate = assistant.match(/const shouldRunAgentRead[\s\S]*?if \(shouldRunAgentRead\)/)?.[0] ?? ''
  assert.match(readGate, /!explicitReminderCreate/)
  assert.match(readGate, /\(!reminderDomainLanguage \|\| Boolean\(explicitReminderRead\)\)/)
})

test('mutation deferrals from the read planner fail closed', () => {
  assert.match(assistant, /agentReadData\?\.handled === true/)
  assert.match(assistant, /server_agent_mutation_blocked/)
  assert.match(assistant, /'agent\.write\.blocked'/)
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
  assert.match(assistant, /shouldRunAgentShadow = !shouldRunAgentWrite && !shouldRunAgentRead/)
})

test('write-lane read deferrals continue to authoritative active-event reads', () => {
  assert.match(assistant, /activeConversationEvent && agentWriteData\?\.planReason !== 'read'/)
  assert.match(assistant, /planReason\?: string \| null/)
})
