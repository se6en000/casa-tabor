import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync(
  new URL('../supabase/functions/ai-agent-read/index.ts', import.meta.url),
  'utf8',
)
const assistantEndpoint = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
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

test('explicit reminder reads bypass probabilistic planning with authoritative type scope', () => {
  assert.match(endpoint, /explicitReminderSearchForMessages/)
  assert.match(endpoint, /trustedReminderRead/)
  assert.match(endpoint, /trusted_reminder_read/)
  assert.match(assistantEndpoint, /explicitReminderRead \|\|/)
})

test('active reminder completion runs before generic active-event mutation handling', () => {
  const reminderCompletion = assistantEndpoint.indexOf(
    "server_ai_assistant_reminder_completion_follow_up",
  )
  const genericMutation = assistantEndpoint.indexOf('const activeMutation = pendingRecurringMutation')
  assert.ok(reminderCompletion > 0)
  assert.ok(genericMutation > reminderCompletion)
})

test('agent read endpoint keeps the authoritative annual event window available to search', () => {
  assert.match(endpoint, /body\.authoritative_data\.events\.slice\(0, 500\)/)
  assert.doesNotMatch(endpoint, /body\.authoritative_data\.events\.slice\(0, 100\)/)
  assert.match(assistantEndpoint, /\['event', 'full', 'travel', 'general'\]\.includes\(intentRouting\.profile\)/)
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

test('multi-event searches retain authoritative candidates for follow-up selection', () => {
  assert.match(endpoint, /plan\.toolName === 'calendar\.search' && activeEvents\?\.length > 1/)
  assert.match(endpoint, /activeEntityType: 'calendar_clarification'/)
  assert.match(endpoint, /pendingMutation: \{ tool: 'select_event', args: \{\} \}/)
  assert.match(endpoint, /eventType: event\.event_type === 'reminder'/)
  assert.match(endpoint, /eventType: activeEvents\[0\]\.event_type === 'reminder'/)
  assert.match(assistantEndpoint, /selection\.conversationState \?\? incomingConversationState/)
})

test('semantic calendar scope retrieves broad context while preserving the primary range', () => {
  assert.match(endpoint, /body\?\.context\?\.calendarReadContext\?\.start/)
  assert.match(endpoint, /calendarReadContext\.contextStart/)
  assert.match(endpoint, /primary_start: calendarReadContext\.start/)
  assert.match(endpoint, /primary_end: calendarReadContext\.end/)
  assert.match(endpoint, /trustedReadOverride/)
  assert.match(endpoint, /trusted_semantic_read/)
  assert.match(endpoint, /planner\?\.policy\?\.decision !== 'execute'/)
})
