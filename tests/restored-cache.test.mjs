import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { LIVE_LIST, liveRestoredLists, shouldPersistQuery } from '../src/lib/eventsCachePersister.ts'

// Jake, Oct 8: "i checked the character box off on the wall and nothing on the desktop app … icognito mode works … theres
// something in the cache thats not updating on refresh". A reload restored the To do list's copy from hours before and
// marked it stale before the wall mounted; with the app's defaults (no fetch on mount) the wall kept showing it.
test('a restored list fetches again as soon as it comes on screen', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { refetchOnMount: false, refetchOnWindowFocus: false, staleTime: 5 * 60_000 } } })
  // Restored from the last session, then marked stale (App's restore step).
  client.setQueryData(['todos'], { copy: 'hours old' })
  await client.invalidateQueries({ predicate: (q) => shouldPersistQuery(q) })
  let fetched = 0
  const queryFn = async () => { fetched++; return { copy: 'fresh' } }
  // With the app's defaults alone: the old copy stays.
  const before = new QueryObserver(client, { queryKey: ['todos'], queryFn })
  const off = before.subscribe(() => {})
  await new Promise((r) => setTimeout(r, 20))
  off()
  assert.equal(fetched, 0)
  // The wall's lists: fetched on mount.
  const after = new QueryObserver(client, { queryKey: ['todos'], queryFn, ...LIVE_LIST })
  const off2 = after.subscribe(() => {})
  await new Promise((r) => setTimeout(r, 20))
  off2()
  assert.equal(fetched, 1)
  assert.deepEqual(client.getQueryData(['todos']), { copy: 'fresh' })
})

test('every restored list (chores, groceries, the family…) catches up on screen; the calendar ranges keep the live feed', () => {
  const client = new QueryClient({ defaultOptions: { queries: { refetchOnMount: false } } })
  liveRestoredLists(client)
  for (const key of ['todos', 'household-chore-done', 'grocery', 'family-members']) assert.equal(client.getQueryDefaults([key]).refetchOnMount, true, key)
  assert.equal(client.getQueryDefaults(['events', 'rolling', 'x']).refetchOnMount, undefined)
})
