import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync(
  new URL('../supabase/functions/ai-agent-write/index.ts', import.meta.url),
  'utf8',
)

test('agent write endpoint proposes additive, exact update, and destructive confirmations through policy', () => {
  assert.match(endpoint, /planner_mode: 'additive_write'/)
  assert.match(endpoint, /evaluateAgentToolCall/)
  assert.match(endpoint, /calendar\.create/)
  assert.match(endpoint, /calendar\.update/)
  assert.match(endpoint, /grocery\.add_items/)
  assert.match(endpoint, /grocery\.update_item/)
  assert.match(endpoint, /calendar\.delete/)
  assert.match(endpoint, /grocery\.remove_item/)
  assert.match(endpoint, /acceptedDecision/)
  assert.match(endpoint, /type: 'tool_action'/)
})

test('agent write endpoint never directly executes mutations', () => {
  assert.doesNotMatch(endpoint, /execute-ai-action/)
  assert.doesNotMatch(endpoint, /\.from\(['"](?:events|grocery_items)['"]\)\.(?:insert|update|delete)/)
  assert.match(endpoint, /acceptedDecision/)
  assert.match(endpoint, /\? 'confirm'/)
})

test('agent write endpoint checks duplicates and emits proposal telemetry', () => {
  assert.match(endpoint, /findAgentCalendarDuplicates/)
  assert.match(endpoint, /isAgentCalendarUpdateTargetUnambiguous/)
  assert.match(endpoint, /isAgentGroceryUpdateTargetUnambiguous/)
  assert.match(endpoint, /adaptAgentGroceryUpdate/)
  assert.match(endpoint, /server_agent_write_proposal/)
  assert.match(endpoint, /server_agent_write_fallback/)
  assert.match(endpoint, /lane: 'agent_write'/)
})

test('active exact updates use semantic resolution without weakening policy context', () => {
  assert.match(endpoint, /activeAuthoritativeEntity/)
  assert.match(endpoint, /planningEntities/)
  assert.match(endpoint, /authoritativeEntities: planningEntities/)
  assert.match(endpoint, /authoritativeEntities,\n\s+activeEntity: activeAuthoritativeEntity,\n\s+duplicateCandidates/)
  assert.match(endpoint, /resolveCalendarSemanticTurn/)
  assert.doesNotMatch(endpoint, /repairInvalidCalendarMoveDuration/)
  assert.doesNotMatch(endpoint, /alignCalendarMoveToRequestedTime/)
  assert.doesNotMatch(endpoint, /calendarRequestedTime/)
})

test('pending legacy confirmation cards are normalized for agent corrections', () => {
  assert.match(endpoint, /getAgentToolByLegacyName/)
  assert.match(endpoint, /normalizedPendingAction/)
  assert.match(endpoint, /toolName: pendingTool\.name/)
  assert.match(endpoint, /pendingAction: normalizedPendingAction/)
})

test('rejected bounded writes are handled without legacy mutation fallthrough', () => {
  assert.match(endpoint, /handled: true/)
  assert.match(endpoint, /writeRejectionText/)
  assert.match(endpoint, /Nothing was saved/)
  assert.match(endpoint, /unknown_calendar_member/)
})

test('planner clarification and ambiguity remain in the bounded lane', () => {
  assert.match(endpoint, /plan\?\.kind === 'clarify'/)
  assert.match(endpoint, /plan\?\.reason === 'ambiguous'/)
  assert.match(endpoint, /I found more than one possible match/)
  assert.match(endpoint, /candidateEntityIds/)
  assert.match(endpoint, /ambiguityClarification/)
})
