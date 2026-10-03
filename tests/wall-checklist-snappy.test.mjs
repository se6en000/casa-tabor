import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/query-core'
import { CHECKLIST_KEY, addInCache, tickInCache } from '../src/wall/checklistCache.ts'

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

// Get & pack adds show the moment they're typed (Oct 2, instant everywhere): every cached list loaded for that event.
test('an added line shows at once at the end of each list that holds its event, and can be undone', () => {
  const qc = new QueryClient()
  qc.setQueryData([...CHECKLIST_KEY, 'e,f'], [{ ...item('shirt'), sort_order: 3 }, { ...item('hat'), event_id: 'f', sort_order: 9 }])
  qc.setQueryData([...CHECKLIST_KEY, 'f'], [{ ...item('hat'), event_id: 'f' }])
  qc.setQueryData([...CHECKLIST_KEY, 'e'], [])
  const undo = addInCache(qc, 'e', 'Water bottle')
  const both = qc.getQueryData([...CHECKLIST_KEY, 'e,f'])
  assert.deepEqual(both.map((i) => i.label), ['shirt', 'hat', 'Water bottle'])
  assert.equal(both[2].sort_order, 4)
  assert.equal(both[2].checked, false)
  assert.deepEqual(qc.getQueryData([...CHECKLIST_KEY, 'e']).map((i) => i.label), ['Water bottle'])
  assert.deepEqual(qc.getQueryData([...CHECKLIST_KEY, 'f']).map((i) => i.label), ['hat'])
  undo()
  assert.deepEqual(qc.getQueryData([...CHECKLIST_KEY, 'e,f']).map((i) => i.label), ['shirt', 'hat'])
  assert.deepEqual(qc.getQueryData([...CHECKLIST_KEY, 'e']), [])
})
