import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const endpoint = readFileSync(
  new URL('../supabase/functions/ai-agent-write/index.ts', import.meta.url),
  'utf8',
)
const assistantEndpoint = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)
const actionEndpoint = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
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
  assert.match(endpoint, /normalizeAgentGroceryAddArgs/)
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
  assert.match(endpoint, /resolveActiveCalendarMutation/)
  assert.doesNotMatch(endpoint, /repairInvalidCalendarMoveDuration/)
  assert.doesNotMatch(endpoint, /alignCalendarMoveToRequestedTime/)
  assert.doesNotMatch(endpoint, /calendarRequestedTime/)
})

test('agent writes retain the authoritative annual event window for target resolution', () => {
  assert.match(endpoint, /body\.authoritative_data\.events\.slice\(0, 500\)/)
  assert.doesNotMatch(endpoint, /body\.authoritative_data\.events\.slice\(0, 100\)/)
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

test('a possible-duplicate policy rejection gets an honest, specific message instead of the generic catch-all', () => {
  // Found live 2026-09-11 while verifying the batch-create feature: the
  // policy layer's clarify('possible_duplicate', tool) code (fired for any
  // calendar.create matching findAgentCalendarDuplicates) had no case in
  // writeRejectionText, so it silently fell through to the generic "I wasn't
  // able to prepare that safely just now" fallback -- which is actively
  // misleading here, since we know exactly why: it looks like a duplicate.
  // Same bug class as the two hardcoded-rejection-message bugs fixed earlier
  // this session (see the memory of the 2026-09-11 overnight session).
  const rejectionSection = endpoint.slice(
    endpoint.indexOf('function writeRejectionText'),
  )
  assert.match(rejectionSection, /possible_duplicate/)
  const possibleDuplicateCase = rejectionSection.slice(
    rejectionSection.indexOf("'possible_duplicate'"),
  )
  assert.match(possibleDuplicateCase.slice(0, 400), /duplicate|already/i)
})

test('planner clarification and ambiguity remain in the bounded lane', () => {
  assert.match(endpoint, /plan\?\.kind === 'clarify'/)
  assert.match(endpoint, /ambiguous_authoritative_target/)
  assert.match(endpoint, /plan\.candidates\.flatMap/)
  assert.match(endpoint, /plan\?\.reason === 'ambiguous'/)
  assert.match(endpoint, /I found more than one possible match/)
  assert.match(endpoint, /candidateEntityIds/)
  assert.match(endpoint, /ambiguityClarification/)
})

test('dry-run QA and production writes share the bounded planner', () => {
  assert.match(assistantEndpoint, /shouldUseAgentWritePlanner\(\{/)
  assert.doesNotMatch(assistantEndpoint, /const shouldRunAgentWrite = !dryRun/)
})

test('assistant proposals and action execution share canonical calendar arguments', () => {
  assert.match(assistantEndpoint, /normalizeLegacyCalendarActionArgs\(/)
  assert.match(actionEndpoint, /normalizeLegacyCalendarActionArgs\(tool, rawArgs\)/)
  assert.match(actionEndpoint, /start is required for create_event/)
  assert.match(actionEndpoint, /end is required for create_event/)
})

test('multi-event calendar_batch_create plans are resolved per-item through the same duplicate check and policy gate as a single create, not a separate weaker path', () => {
  assert.match(endpoint, /resolveCalendarBatchCreate/)
  assert.match(endpoint, /calendar_batch_create/)
  assert.match(endpoint, /'tool_action_batch'/)
  // Each batch item must go through findAgentCalendarDuplicates + evaluateAgentToolCall,
  // the exact same policy gate a single calendar.create proposal uses -- a batch item is
  // never allowed to skip duplicate/policy checks that a single create would be held to.
  const batchSection = endpoint.slice(endpoint.indexOf('calendar_batch_create'))
  assert.match(batchSection, /findAgentCalendarDuplicates/)
  assert.match(batchSection, /evaluateAgentToolCall/)
  // The exact-duplicate policy gate above only blocks an identical repeat.
  // A batch curation card reviewing several unfamiliar items at once also
  // needs the richer "this looks like it might already exist" hint a single
  // create doesn't surface at proposal time -- enrichBatchCandidates (built
  // in phase 1 of this feature) is exactly that, and must actually be wired
  // in here rather than left unused.
  assert.match(batchSection, /enrichBatchCandidates/)
  assert.match(batchSection, /duplicateHint/)
  // Found live 2026-09-11 while discussing this feature with the user: a
  // "conflict" (the same family member double-booked into two events) can
  // only ever be detected by assessCalendarCreatePreflight when it's given
  // the proposed event's members -- omitting them here means every batch
  // item silently loses the "same person, two places" conflict check that a
  // single create effectively gets via this same preflight function.
  const enrichCallSection = batchSection.slice(
    batchSection.indexOf('enrichBatchCandidates'),
    batchSection.indexOf('enrichBatchCandidates') + 600,
  )
  assert.match(enrichCallSection, /members:/)
})
