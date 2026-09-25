import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { QueryClient } from '@tanstack/react-query'

const loadCache = () => import('../src/lib/eventAggregateCache.ts')

// 2026-09-21 event-create latency investigation (see ai_bug_reports b2b9d06f /
// a6f58eba). Measured on prod: a create on a fresh DB connection cost ~2.4s of
// DB time vs ~0.14s warm; the client made it worse by (a) sending every
// calendar-feed request twice (invalidateQueries then refetchQueries, whose
// cancelRefetch default cancels+restarts the in-flight fetch, so PostgREST runs
// both and opens extra cold connections), (b) awaiting a full refetch before
// closing the save sheet, and (c) three sequential client round trips.
//
// Investigated and REJECTED: coalescing the analyze-conflicts row triggers. The
// vault has no SUPABASE_SERVICE_ROLE_KEY, so trigger_analyze_conflicts_* and
// trigger_geocode_event_location are already silent no-ops (warning + return);
// only enrich-event is actually queued per create. Nothing to coalesce.

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const between = (src, start, end) => {
  const from = src.indexOf(start)
  assert.ok(from >= 0, `marker not found: ${start}`)
  const to = end ? src.indexOf(end, from + start.length) : -1
  return src.slice(from, to > from ? to : undefined)
}

// ---------------------------------------------------------------- #4 stampede
test('realtime invalidation does not chain refetchQueries after invalidateQueries (double request per feed)', () => {
  const src = read('src/hooks/useCalendarEvents.ts')
  const block = between(src, 'function useRealtimeEventInvalidation', 'const onManualMutated')
  assert.match(block, /invalidateQueries\(\{ queryKey: \['events'\] \}\)/)
  assert.doesNotMatch(block, /refetchQueries\(\{ queryKey: \['events'\]/)
})

test('invalidateAllCalendarQueries relies on invalidate (which already refetches active queries), not a second refetch', () => {
  const src = read('src/lib/eventMutations.ts')
  const block = between(src, 'export function invalidateAllCalendarQueries', 'export async function materializeSyntheticRoutineEvent')
  assert.match(block, /invalidateQueries\(\{ queryKey: \['events'\] \}\)/)
  assert.doesNotMatch(block, /refetchQueries\(\{ queryKey: \['events'\]/)
})

// ------------------------------------------------------- #1 optimistic add
function rangeQuery(qc, key, rangeStart, rangeEnd, data) {
  const query = qc.getQueryCache().build(qc, {
    queryKey: key,
    meta: { rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() },
  })
  if (data !== undefined) query.setData(data)
  return query
}

const newEvent = (over = {}) => ({
  id: 'new-1',
  title: 'Liv Huskies Softball Practice',
  start_time: '2026-09-21T22:00:00.000Z',
  end_time: '2026-09-22T00:00:00.000Z',
  members: [],
  enrichment: null,
  plan_override: null,
  logistics: [],
  checklist: [],
  actions: [],
  ...over,
})

test('addEventToCaches appends an overlapping event to range caches, sorted by start, without duplicating', async () => {
  const { addEventToCaches } = await loadCache()
  const qc = new QueryClient()
  const existing = newEvent({ id: 'later', start_time: '2026-09-21T23:00:00.000Z' })
  const q = rangeQuery(
    qc, ['events', 'rolling', 'a'],
    new Date('2026-09-21T04:00:00Z'), new Date('2026-09-28T04:00:00Z'),
    { active: [existing], cancelled: [] },
  )
  addEventToCaches(qc, newEvent())
  addEventToCaches(qc, newEvent()) // idempotent: same id twice
  const ids = q.state.data.active.map((e) => e.id)
  assert.deepEqual(ids, ['new-1', 'later'])
})

test('addEventToCaches leaves caches whose range does not overlap the event, and unloaded caches, untouched', async () => {
  const { addEventToCaches } = await loadCache()
  const qc = new QueryClient()
  const far = rangeQuery(
    qc, ['events', 'month', 'far'],
    new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'),
    { active: [], cancelled: [] },
  )
  const unloaded = rangeQuery(qc, ['events', 'week', 'unloaded'], new Date('2026-09-21T00:00:00Z'), new Date('2026-09-28T00:00:00Z'))
  addEventToCaches(qc, newEvent())
  assert.deepEqual(far.state.data.active, [])
  assert.equal(unloaded.state.data, undefined)
})

test('the range hook publishes its range as query meta so addEventToCaches can place events', () => {
  const src = read('src/hooks/useCalendarEvents.ts')
  const block = between(src, 'function useEventsForRange', 'const { data: familyMembers')
  assert.match(block, /meta:\s*\{[^}]*rangeStart[^}]*rangeEnd/)
})

test('quick-create closes without awaiting a full events refetch and adds the event optimistically', () => {
  const src = read('src/components/calendar/PalmBeachFolioCard.tsx')
  const block = between(src, 'const handleSave = async', 'const currentDate')
  assert.doesNotMatch(block, /await qc\.invalidateQueries/)
  assert.match(block, /addEventToCaches\(/)
})

// ------------------------------------------------------ #2 atomic single RPC
test('quick-create writes place + event + members through ONE upsert_event_bundle RPC, not sequential client inserts', () => {
  const src = read('src/components/calendar/PalmBeachFolioCard.tsx')
  const block = between(src, 'const handleSave = async', 'const currentDate')
  assert.match(block, /supabase\.rpc\('upsert_event_bundle'/)
  assert.doesNotMatch(block, /\.from\('events'\)\.insert/)
  assert.doesNotMatch(block, /\.from\('event_members'\)\.insert/)
  assert.doesNotMatch(block, /\.from\('saved_places'\)\.insert/)
})

test('chat create_event executor writes event + members through the same RPC', () => {
  const src = read('supabase/functions/execute-ai-action/index.ts')
  const block = between(src, "if (tool === 'create_event')", "if (tool === 'create_recipe')")
  assert.match(block, /sb\.rpc\('upsert_event_bundle'/)
  assert.doesNotMatch(block, /sb\.from\('events'\)\.insert/)
  assert.doesNotMatch(block, /sb\.from\('event_members'\)\.insert/)
  // the "open event" link in chat is built from this id -- it must still be returned synchronously
  assert.match(block, /event_id: event\.id/)
})

test('upsert_event_bundle migration: typed uuid id, lat/lng, optional saved_place, callable by the app roles', () => {
  const path = 'supabase/migrations/20260922225034_upsert_event_bundle_client_create.sql'
  assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} must exist`)
  const sql = read(path)
  assert.match(sql, /create or replace function public\.upsert_event_bundle\(p_payload jsonb\)/i)
  assert.match(sql, /::uuid/)
  assert.match(sql, /'lat'/)
  assert.match(sql, /'lng'/)
  assert.match(sql, /saved_place/)
  assert.match(sql, /grant execute on function public\.upsert_event_bundle\(jsonb\) to anon, authenticated, service_role/i)
  assert.match(sql, /updated_at/)
})
