import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Bug report 2026-09-29 10:03 PM ("Something happened when trying to delete [a] duplicate appointment"):
// Casa's delete set deleted_at without purge_after, and events_tombstone_check rejected it — after the
// event's people, checklist and plan had already been cleared. The database now fills the purge date
// (run against it in tests/sql/events-purge-after-scenario.sql, rolled back); the deletes send it too,
// and a delete clears the details only once the event is deleted.
const migration = readFileSync(new URL('../supabase/migrations/20261001100000_events_purge_after_default.sql', import.meta.url), 'utf8')
const action = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')

test('a deleted event always gets its purge date, in the database', () => {
  assert.match(migration, /new\.purge_after := new\.deleted_at \+ interval '30 days'/)
  assert.match(migration, /before insert or update of deleted_at, purge_after on public\.events/)
})

test("Casa's deletes send the purge date, and clear the details only after the event is deleted", () => {
  const one = action.slice(action.indexOf("if (tool === 'delete_event')"), action.indexOf("if (tool === 'complete_reminder')"))
  assert.ok(one.indexOf("purge_after:") > 0 && one.indexOf("purge_after:") < one.indexOf("from('event_members').delete()"), 'the event first, then its details')
  assert.equal((action.match(/deleted_at: new Date\(\)\.toISOString\(\),\n\s+purge_after:/g) ?? []).length, 2, 'both deletes')
})
