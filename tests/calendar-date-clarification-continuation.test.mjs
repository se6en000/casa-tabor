import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-21/22: root cause of the "today" reply after a date-clarification
// question still taking ~2.9s through the full family-data RAG pipeline
// (embedding call + search_family_data), confirmed live in ai_bug_reports
// b2b9d06f's 15:07 conversation. The 2026-09-19 fix (2e7d8a51,
// tests/assistant-write-flow-continuation-retrieval.test.mjs) made
// isActiveWriteFlowContinuation trust incomingConversationState.expectedFollowUp
// -- but BOTH places ai-assistant returns the "what date should I use?"
// question return a bare `{ type: 'text', text }` payload with NO
// conversation_state at all, so expectedFollowUp is never set in the first
// place and that fix could never fire for this exact, common flow (create an
// event, get asked for a date, answer with a bare date word).
import {
  calendarDateNeededConversationState,
  normalizeConversationState,
} from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'

test('calendarDateNeededConversationState builds a normalizable state carrying the pending create args', () => {
  const now = new Date('2026-09-22T12:00:00Z')
  const state = calendarDateNeededConversationState({ title: 'Dr George', members: ['Owen'] }, now)
  assert.equal(state.activeEntityType, 'calendar_date_needed')
  assert.equal(state.expectedFollowUp, 'calendar_date_needed')
  assert.deepEqual(state.pendingCreateArgs, { title: 'Dr George', members: ['Owen'] })

  const roundTripped = normalizeConversationState(state, now.getTime() + 1000)
  assert.deepEqual(roundTripped, state)
})

test('normalizeConversationState rejects a calendar_date_needed state with no pending args', () => {
  const now = new Date('2026-09-22T12:00:00Z')
  assert.equal(
    normalizeConversationState({ activeEntityType: 'calendar_date_needed', establishedAt: now.toISOString() }, now.getTime()),
    null,
  )
})

const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')

test('ai-assistant imports calendarDateNeededConversationState from the shared grounding module', () => {
  assert.match(source, /calendarDateNeededConversationState/)
})

test('client AIMessage.conversationState type declares the calendar_date_needed variant', () => {
  const useAISession = readFileSync(new URL('../src/hooks/useAISession.ts', import.meta.url), 'utf8')
  const idx = useAISession.indexOf("activeEntityType: 'calendar_date_needed'")
  assert.ok(idx >= 0)
  const block = useAISession.slice(idx, idx + 200)
  assert.match(block, /pendingCreateArgs: Record<string, unknown>/)
  assert.match(block, /expectedFollowUp: 'calendar_date_needed'/)
})
