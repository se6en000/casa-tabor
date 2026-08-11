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
