import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildAuthoritativeCalendarRead,
  calendarReadSynthesisPrompt,
  isCalendarReadAnswerComplete,
} from '../supabase/functions/_shared/assistant-authoritative-calendar-read.mjs'

const assistantEndpoint = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

const range = {
  start: '2026-08-08T04:00:00.000Z',
  end: '2026-08-09T04:00:00.000Z',
  contextStart: '2026-08-08T04:00:00.000Z',
  contextEnd: '2026-08-09T04:00:00.000Z',
  label: 'Saturday',
}

const events = Array.from({ length: 12 }, (_, index) => ({
  id: `event-${index + 1}`,
  title: `Saturday event ${index + 1}`,
  start_time: `2026-08-08T${String(13 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}:00.000Z`,
  end_time: `2026-08-08T${String(14 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}:00.000Z`,
  all_day: false,
  event_type: index === 11 ? 'reminder' : 'event',
  event_members: [{ family_members: { name: index % 2 ? 'Owen' : 'Jake' } }],
}))

test('authoritative calendar reads preserve every event in the requested range', () => {
  const result = buildAuthoritativeCalendarRead(range, events, '-04:00')

  assert.equal(result.count, 12)
  assert.equal(result.events.length, 12)
  assert.deepEqual(result.events.map((event) => event.id), events.map((event) => event.id))
})

test('calendar synthesis prompt requires complete conversational enumeration without internal IDs', () => {
  const result = buildAuthoritativeCalendarRead(range, events, '-04:00')
  const prompt = calendarReadSynthesisPrompt("What's going on Saturday?", result)

  assert.match(prompt, /mention every item exactly once/i)
  assert.match(prompt, /12 authoritative calendar items/)
  assert.match(prompt, /Saturday event 12/)
  assert.doesNotMatch(prompt, /event-12/)
  assert.doesNotMatch(prompt, /\[ID:/)
})

test('calendar synthesis completeness rejects an answer that omits an authoritative item', () => {
  const result = buildAuthoritativeCalendarRead(range, events.slice(0, 3), '-04:00')
  assert.equal(
    isCalendarReadAnswerComplete(
      'Saturday event 1 is first, followed by Saturday event 2.',
      result,
    ),
    false,
  )
  assert.equal(
    isCalendarReadAnswerComplete(
      'Saturday event 1 is first, followed by Saturday event 2 and Saturday event 3.',
      result,
    ),
    true,
  )
})

test('assistant uses one compact synthesis call after authoritative calendar range retrieval', () => {
  assert.match(assistantEndpoint, /buildAuthoritativeCalendarRead\(\s*calendarReadContext,\s*allEvents/)
  assert.match(assistantEndpoint, /calendarReadSynthesisPrompt\(latestUserText, authoritativeRead\)/)
  assert.match(assistantEndpoint, /server_ai_assistant_authoritative_calendar_read/)
  assert.match(assistantEndpoint, /calendarRangeConversationState\(\s*calendarReadContext,\s*authoritativeRead\.events/)
  assert.match(assistantEndpoint, /source: 'calendar_language_contract',\s*semantic_intent: calendarFrame\.intent/)
})
