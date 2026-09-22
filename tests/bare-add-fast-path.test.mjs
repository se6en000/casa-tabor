import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { isBareCalendarAddRequest } from '../supabase/functions/_shared/assistant-calendar-language.mjs'

// 2026-09-21/22: root cause of "add"/"add event" timing out with a 504,
// confirmed live in ai_bug_reports b2b9d06f. A bare "add" has zero title/day/
// time signal, but still ran the FULL serial pipeline (agent write-plan LLM
// call -> agent read-plan LLM call -> family-data context load -> primary
// call) and burned the entire 9s NORMAL_REQUEST_HARD_TIMEOUT_MS before the
// primary call ever ran (measured: 2139ms + 1604ms + 2766ms = 6.5s gone before
// the primary call got 0ms of remaining budget -> instant 504).

test('isBareCalendarAddRequest matches genuinely content-free add requests', () => {
  for (const text of [
    'add', 'Add', ' add ', 'add.', 'add!',
    'add event', 'add an event', 'add a event', 'add the event',
    'add reminder', 'add a reminder', 'add task', 'add to-do', 'add todo',
    'add appointment', 'add item',
  ]) {
    assert.ok(isBareCalendarAddRequest(text), `expected "${text}" to match`)
  }
})

test('isBareCalendarAddRequest does NOT match a request carrying any real content', () => {
  for (const text of [
    'add event tomorrow', 'add dentist appointment', 'add Liv Huskies Softball Practice, at Lake lytal, today, 6-8pm',
    'add Owen to Dr George', 'please add an event', 'add it', '', '   ', 'update event', 'delete event',
  ]) {
    assert.ok(!isBareCalendarAddRequest(text), `expected "${text}" NOT to match`)
  }
})

const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')

test('ai-assistant short-circuits a bare add request before any agent-write/read/shadow LLM call or context load', () => {
  assert.match(source, /isBareCalendarAddRequest/)
  const fastPathIdx = source.indexOf('isBareCalendarAddRequest(latestUserText)')
  assert.ok(fastPathIdx >= 0)
  const shouldRunAgentWriteIdx = source.indexOf('const shouldRunAgentWrite =')
  const contextLoadIdx = source.indexOf('const contextLoadStartMs')
  assert.ok(fastPathIdx < shouldRunAgentWriteIdx, 'fast path must run before the agent-write LLM call')
  assert.ok(fastPathIdx < contextLoadIdx, 'fast path must run before family-data context load')
  const block = source.slice(fastPathIdx - 200, fastPathIdx + 500)
  assert.match(block, /llm_calls:\s*0/)
  assert.match(block, /type:\s*'text'/)
})
