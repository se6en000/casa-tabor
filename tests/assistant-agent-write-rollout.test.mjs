import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)
const agentWrite = readFileSync(
  new URL('../supabase/functions/_shared/assistant-agent-write.mjs', import.meta.url),
  'utf8',
)

test('additive agent writes are feature flagged and sampled', () => {
  assert.match(assistant, /agent_write_config/)
  assert.match(assistant, /agentWriteConfig\?\.enabled === true/)
  assert.match(assistant, /sample: Math\.random\(\)/)
  assert.match(agentWrite, /Number\(options\.sample\) < Number\(options\.agentWriteRate\)/)
  assert.match(assistant, /AGENT_GENERAL_PAGES\.has/)
  assert.match(assistant, /chefMode: context\?\.assistant_mode === 'chef'/)
})

test('reminder vocabulary cannot enter the generic agent write lane', () => {
  assert.match(agentWrite, /options\.reminderDomainLanguage !== true/)
  assert.match(agentWrite, /options\.explicitReminderCreate !== true/)
})

test('write rollout supports global drawer pages and pending-action corrections', () => {
  assert.match(assistant, /new Set\(\['app', 'briefing', 'calendar', 'grocery', 'home'\]\)/)
  assert.doesNotMatch(
    assistant.match(/const shouldRunAgentWrite[\s\S]*?if \(shouldRunAgentWrite\)/)?.[0] ?? '',
    /!context\?\.pendingAction/,
  )
  assert.match(assistant, /pendingAction: context\?\.pendingAction/)
})

test('bounded write rejections cannot fall through to legacy execution', () => {
  assert.match(assistant, /agentWriteData\?\.handled === true/)
  assert.match(assistant, /server_agent_write_blocked/)
  assert.match(assistant, /'agent\.write\.blocked'/)
})

test('write rollout adopts only allowlisted proposal actions', () => {
  assert.match(assistant, /agentWriteData\?\.supported === true/)
  assert.match(assistant, /agentWriteData\.type === 'tool_action'/)
  assert.match(assistant, /'check_grocery_item'/)
  assert.match(assistant, /'update_grocery_item_quantity'/)
  assert.match(assistant, /'delete_event'/)
  assert.match(assistant, /'remove_grocery_item'/)
  assert.match(assistant, /'agent\.write\.destructive'/)
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

test('agent routing keeps model-authored move timestamps out of the write contract', () => {
  assert.doesNotMatch(assistant, /calendarRequestedTime/)
  assert.match(assistant, /currentDate: now\.toISOString\(\)/)
  assert.match(assistant, /groceryQuery: groceryFrame\?\.slots\?\.item/)
  assert.match(assistant, /calendarReadContext/)
  assert.match(assistant, /calendarRangeForScope/)
})

test('write rollout falls through to authoritative reads after non-write plans', () => {
  assert.match(assistant, /server_agent_write_fallback/)
  assert.match(assistant, /agentWriteData\?\.code/)
  assert.match(assistant, /agent_write_timeout/)
  assert.match(agentWrite, /options\.isCalendarSemanticRead !== true/)
  assert.match(assistant, /isCalendarSemanticRead \|\| Math\.random\(\) < agentReadRate/)
  assert.match(assistant, /shouldRunAgentRead = !dryRun/)
  assert.match(assistant, /shouldRunAgentShadow = !shouldRunAgentWrite && !shouldRunAgentRead/)
})

test('write planner budget accommodates nested cold starts within the request budget', () => {
  assert.match(assistant, /agent_write_timeout[\s\S]{0,100}6500/)
})
