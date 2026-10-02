import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { refreshAfter } from '../src/wall/todoRefresh.ts'

// Jake, Oct 1: Liv's Scuba Diver Costume, removed from inside Halloween costumes, stayed on Halloween's page: only the
// removed project was re-read. A project change re-reads every project page held.
test('a project removed from inside another: the parent’s page is re-read too', async () => {
  const qc = new QueryClient()
  qc.setQueryData(['todos'], { nextUp: [] })
  qc.setQueryData(['todo-project', 'halloween'], { project: { id: 'halloween' } })
  qc.setQueryData(['todo-project', 'liv-scuba'], { project: { id: 'liv-scuba' } })
  await refreshAfter(qc, { action: 'project_edit', id: 'liv-scuba', op: 'delete_project' })
  assert.equal(qc.getQueryState(['todo-project', 'halloween']).isInvalidated, true)
  assert.equal(qc.getQueryState(['todo-project', 'liv-scuba']).isInvalidated, true)
  assert.equal(qc.getQueryState(['todos']).isInvalidated, true)
})

test('a to-do answered re-reads the list, not the project pages', async () => {
  const qc = new QueryClient()
  qc.setQueryData(['todos'], { nextUp: [] })
  qc.setQueryData(['todo-project', 'halloween'], { project: { id: 'halloween' } })
  await refreshAfter(qc, { action: 'done', id: 'td-trash' })
  assert.equal(qc.getQueryState(['todos']).isInvalidated, true)
  assert.equal(qc.getQueryState(['todo-project', 'halloween']).isInvalidated, false)
})
