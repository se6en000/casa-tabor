import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import { CHECKLIST_KEY, tickInCache } from '../src/wall/checklistCache.ts'

const item = (id, checked = false) => ({ id, event_id: 'e', label: id, checked, sort_order: 0 })

test('a tick flips at once in every cached list holding it, and can be undone', () => {
  const qc = new QueryClient()
  qc.setQueryData([...CHECKLIST_KEY, 'a,b'], [item('shirt'), item('cleats')])
  qc.setQueryData([...CHECKLIST_KEY, 'a'], [item('shirt')])
  qc.setQueryData(['events', 'other'], [item('shirt')])
  const undo = tickInCache(qc, 'shirt', true)
  assert.deepEqual(qc.getQueryData([...CHECKLIST_KEY, 'a,b']).map((i) => i.checked), [true, false])
  assert.equal(qc.getQueryData([...CHECKLIST_KEY, 'a'])[0].checked, true)
  assert.equal(qc.getQueryData(['events', 'other'])[0].checked, false)
  undo()
  assert.equal(qc.getQueryData([...CHECKLIST_KEY, 'a,b'])[0].checked, false)
  assert.equal(qc.getQueryData([...CHECKLIST_KEY, 'a'])[0].checked, false)
})
