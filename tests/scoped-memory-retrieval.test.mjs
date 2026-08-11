import assert from 'node:assert/strict'
import test from 'node:test'

import { loadScopedMemoryEvidence } from '../supabase/functions/_shared/scoped-memory.mjs'

test('memory storage failure remains a partial source instead of failing assistant retrieval', async () => {
  const result = await loadScopedMemoryEvidence({
    memberId: 'member-1',
    fetchRows: async () => {
      throw new Error('relation "ai_memories" does not exist')
    },
  })

  assert.deepEqual(result.evidence, [])
  assert.deepEqual(result.partialSources, ['memory'])
  assert.match(result.error, /does not exist/)
})
