import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

// 2026-09-19: a short reply continuing an already-established creation/edit
// flow (e.g. "Monday." answering "When should I remind you?") has none of
// userRequestedWriteIntent's keywords, so it was misclassified as a fresh
// family-data question. That triggered the full RAG evidence pipeline
// (Gemini embedding call + search_family_data) for a one-word date answer --
// confirmed live via ai_bug_reports a6f58eba (42.7s to the confirm card;
// search_family_data itself measured at 13.0s in postgres logs for that
// exact turn). Fix: consult conversationState.expectedFollowUp, which the
// app already tracks, instead of only regex-matching the raw current text.
test('userRequestedWriteIntent treats an active follow-up flow as write intent, not just keyword matches', () => {
  const idx = source.indexOf('const isScheduleQuery =')
  const block = source.slice(idx, idx + 1400)
  assert.match(block, /incomingConversationState\?\.expectedFollowUp/)
  assert.match(block, /expectedFollowUp !== 'none'/)
  assert.match(block, /isActiveWriteFlowContinuation/)
})

test('the follow-up continuation still defers to isScheduleQuery so a real schedule question is not misread as a write', () => {
  const idx = source.indexOf('const isActiveWriteFlowContinuation')
  const block = source.slice(idx, idx + 300)
  assert.match(block, /!isScheduleQuery/)
})

test('needsUnifiedFamilyRetrieval still gates on userRequestedWriteIntent (the fix widens the input, not the gate itself)', () => {
  const idx = source.indexOf('const needsUnifiedFamilyRetrieval')
  const block = source.slice(idx, idx + 300)
  assert.match(block, /!userRequestedWriteIntent/)
})
