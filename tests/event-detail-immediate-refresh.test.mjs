import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stateHook = readFileSync(new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url), 'utf8')
const aggregateCache = readFileSync(new URL('../src/lib/eventAggregateCache.ts', import.meta.url), 'utf8')

test('Living Flow handles immediate event refresh and cache invalidation', () => {
  assert.match(stateHook, /invalidateCalendar/)
  assert.match(stateHook, /queryClient\.invalidateQueries\(\{ queryKey: \['events'\] \}\)/)
  assert.match(aggregateCache, /new CustomEvent\('casa:event-updated'/)
})
