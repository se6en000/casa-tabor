import assert from 'node:assert/strict'
import test from 'node:test'

import { inferPersonalMemoryCandidates } from '../supabase/functions/_shared/personal-memory-extraction.mjs'

test('memory extraction preserves source message provenance', () => {
  assert.deepEqual(
    inferPersonalMemoryCandidates([
      { id: 'message-1', role: 'user', content: 'I prefer morning appointments after school drop-off.' },
    ]),
    [{
      sourceMessageId: 'message-1',
      title: 'Personal preference',
      content: 'I prefer morning appointments after school drop-off.',
      category: 'preference',
      confidence: 0.9,
    }],
  )
})

test('memory extraction ignores assistant messages and unstable short statements', () => {
  assert.deepEqual(
    inferPersonalMemoryCandidates([
      { id: 'message-1', role: 'assistant', content: 'I prefer morning appointments.' },
      { id: 'message-2', role: 'user', content: 'I like it.' },
    ]),
    [],
  )
})

test('memory extraction records only user-authored explicit temporal evidence', () => {
  const [memory] = inferPersonalMemoryCandidates([
    { id: 'message-3', role: 'user', content: 'I want to plan my Miami anniversary from August 28 through August 30, 2026.' },
  ], {
    now: new Date('2026-08-13T16:00:00.000Z'),
    utcOffset: '-04:00',
  })

  assert.deepEqual(memory.temporalEvidence, {
    sourceMessageId: 'message-3',
    sourceText: 'I want to plan my Miami anniversary from August 28 through August 30, 2026.',
    rangeStart: '2026-08-28',
    rangeEnd: '2026-08-30',
    resolutionKind: 'explicit_range',
    requiresExactDateConfirmation: true,
  })
})
