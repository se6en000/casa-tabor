import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: deleting a reminder in Casa did not stop it from coming back. Root
// cause, confirmed live against real production data (a test reminder and a real
// household reminder both resurrected with a brand-new id, last_modified_source
// 'ios', within a second of each other):
//
// 1. deleteCalendarEvent hard-deletes the events row for every event type, reminders
//    included -- unlike a Google-synced event (which gets an explicit
//    delete-google-event call), nothing ever tells the iOS reminders sync a reminder
//    was deleted, and the hard delete leaves no deleted_at tombstone for the sync's
//    delta query to find even if it looked.
// 2. get_todo_reminder_deltas (the Casa->iOS export) excludes any row whose
//    event_ios_reminder_links.last_modified_source = 'ios' -- meant to stop an
//    iOS-originated update from echoing back to iOS, but it also permanently hides
//    that reminder's eventual deletion, since a reminder created in Casa and pushed
//    to Apple Reminders gets stamped 'ios' the moment the round trip completes and
//    links it (see upsert_todo_reminder_from_ios's fallback title-match).
//
// Together: delete a reminder that's ever synced to Apple Reminders, and nothing
// ever reaches the Mac script. The Apple Reminder lives on, and the next iOS->Casa
// poll sees an unlinked reminder it doesn't know about and recreates it in Casa.
//
// Fix: reminders soft-delete (a deleted_at tombstone) instead of hard-deleting, and
// the delta query always reports a deletion regardless of last_modified_source --
// echo-loop suppression stays for ordinary updates, never for a tombstone.

const eventMutations = readFileSync(new URL('../src/lib/eventMutations.ts', import.meta.url), 'utf8')
const deltaMigration = readFileSync(new URL('../supabase/migrations/20260924210000_todo_reminder_delete_sync.sql', import.meta.url), 'utf8')

test('deleteCalendarEvent soft-deletes reminders (tombstone) instead of hard-deleting', () => {
  const fnBody = eventMutations.slice(
    eventMutations.indexOf('export async function deleteCalendarEvent'),
    eventMutations.indexOf('export async function syncAndMaterializeRecurringSeries'),
  )
  assert.match(fnBody, /eventType === 'reminder'/)
  assert.match(fnBody, /deleted_at:\s*new Date\(\)\.toISOString\(\)/)
  // event_ios_reminder_links must never be in the hard-delete cleanup list -- the
  // tombstoned reminder still needs its ios_reminder_id so the sync knows which
  // Apple Reminder to remove.
  assert.doesNotMatch(fnBody, /event_ios_reminder_links['"]\)\s*\n?\s*\.delete\(\)/)
})

test('a real event (not a reminder) still hard-deletes, unchanged', async () => {
  const { deleteCalendarEvent } = await import('../src/lib/eventMutations.ts')
  const deletedTables = []
  const updatedTables = []
  const mockSupabase = {
    functions: { invoke: () => Promise.resolve({ error: null }) },
    from: (table) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { event_type: 'event' } }) }),
      }),
      update: (payload) => ({ eq: () => { updatedTables.push([table, payload]); return Promise.resolve({ error: null }) } }),
      delete: () => ({ eq: () => { deletedTables.push(table); return Promise.resolve({ error: null }) } }),
    }),
  }
  const mockQueryClient = {
    getQueryData: () => null, setQueryData: () => {}, setQueriesData: () => {},
    removeQueries: () => {}, invalidateQueries: () => Promise.resolve(), refetchQueries: () => Promise.resolve(),
  }
  await deleteCalendarEvent(mockSupabase, mockQueryClient, 'evt-real', { id: 'evt-real', event_type: 'event' })
  assert.ok(deletedTables.includes('events'))
  assert.equal(updatedTables.length, 0)
})

test('a reminder soft-deletes: events gets an update with deleted_at, never a delete', async () => {
  const { deleteCalendarEvent } = await import('../src/lib/eventMutations.ts')
  const deletedTables = []
  const updatedTables = []
  const mockSupabase = {
    functions: { invoke: () => Promise.resolve({ error: null }) },
    from: (table) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { event_type: 'reminder' } }) }),
      }),
      update: (payload) => ({ eq: () => { updatedTables.push([table, payload]); return Promise.resolve({ error: null }) } }),
      delete: () => ({ eq: () => { deletedTables.push(table); return Promise.resolve({ error: null }) } }),
    }),
  }
  const mockQueryClient = {
    getQueryData: () => null, setQueryData: () => {}, setQueriesData: () => {},
    removeQueries: () => {}, invalidateQueries: () => Promise.resolve(), refetchQueries: () => Promise.resolve(),
  }
  await deleteCalendarEvent(mockSupabase, mockQueryClient, 'rem-1', { id: 'rem-1', event_type: 'reminder' })
  assert.ok(!deletedTables.includes('events'), 'events should never be hard-deleted for a reminder')
  const eventsUpdate = updatedTables.find(([table]) => table === 'events')
  assert.ok(eventsUpdate, 'events should receive an update call')
  assert.ok(eventsUpdate[1].deleted_at, 'the update payload should set deleted_at')
})

test('get_todo_reminder_deltas always reports a deletion, even for an iOS-sourced row', () => {
  assert.match(deltaMigration, /or e\.deleted_at is not null/)
})
