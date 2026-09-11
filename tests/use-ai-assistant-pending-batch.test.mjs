import assert from 'node:assert/strict'
import test from 'node:test'

import { derivePendingBatchAction } from '../src/lib/assistantPendingBatch.mjs'

// Found live 2026-09-11: with a 3-item batch proposed but not yet confirmed,
// replying "great job." (not a real instruction) caused the planner to
// silently reconstruct and re-propose the whole batch from conversation
// history, since it had no signal a batch was already awaiting the user's
// own confirm tap. derivePendingBatchAction gives the planner that signal,
// mirroring how a single pending toolAction already works.

test('derives a pending batch action from the latest assistant message with proposed rows', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'add soccer tuesday, piano thursday' },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Review below:',
      toolActionBatch: {
        actions: [
          { status: 'proposed', args: { title: 'Soccer Practice' } },
          { status: 'proposed', args: { title: 'Piano' } },
        ],
      },
    },
  ]
  assert.deepEqual(derivePendingBatchAction(messages), {
    count: 2,
    titles: ['Soccer Practice', 'Piano'],
  })
})

test('excludes needs_input and rejected rows -- only genuinely proposed items are pending', () => {
  const messages = [
    {
      id: 'a1',
      role: 'assistant',
      content: 'Review below:',
      toolActionBatch: {
        actions: [
          { status: 'proposed', args: { title: 'Soccer Practice' } },
          { status: 'needs_input', text: 'What time?' },
          { status: 'rejected', code: 'possible_duplicate' },
        ],
      },
    },
  ]
  assert.deepEqual(derivePendingBatchAction(messages), {
    count: 1,
    titles: ['Soccer Practice'],
  })
})

test('returns undefined once nothing in the batch is still proposed', () => {
  const messages = [
    {
      id: 'a1',
      role: 'assistant',
      content: 'Review below:',
      toolActionBatch: {
        actions: [
          { status: 'rejected', code: 'possible_duplicate' },
          { status: 'needs_input', text: 'What time?' },
        ],
      },
    },
  ]
  assert.equal(derivePendingBatchAction(messages), undefined)
})

test('returns undefined when there is no batch message at all', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'hi' },
    { id: 'a1', role: 'assistant', content: 'Hello!' },
  ]
  assert.equal(derivePendingBatchAction(messages), undefined)
})

test('uses the most recent batch message, not an older one', () => {
  const messages = [
    {
      id: 'a1',
      role: 'assistant',
      content: 'Review below:',
      toolActionBatch: { actions: [{ status: 'proposed', args: { title: 'Old One' } }] },
    },
    { id: 'u2', role: 'user', content: 'add something else too' },
    {
      id: 'a2',
      role: 'assistant',
      content: 'Review below:',
      toolActionBatch: { actions: [{ status: 'proposed', args: { title: 'New One' } }] },
    },
  ]
  assert.deepEqual(derivePendingBatchAction(messages), {
    count: 1,
    titles: ['New One'],
  })
})
