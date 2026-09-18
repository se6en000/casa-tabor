import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260918120000_narrow_casa_edit_tracking_trigger.sql', import.meta.url),
  'utf8',
)

// Real bug found live 2026-09-18: the casa-edit-tracking trigger
// (20260918000000_todo_reminder_casa_edit_tracking.sql) fired on ANY update
// to `events`, including background automation unrelated to a real edit.
// That flipped last_modified_source back to 'casa' for iOS-originated
// reminders that were never tagged with a [casa_id:...] note on the Mac
// side, causing them to be re-exported and duplicated there (the Mac
// script's byCasaId lookup correctly found nothing and created a new one).
// Verified live: an irrelevant field touch (description) no longer flips
// last_modified_source, while a real edit (title) still does.
test('casa-edit-tracking trigger only fires on fields a real edit would change, not every incidental touch', () => {
  assert.match(migrationSource, /when \(/)
  assert.match(migrationSource, /old\.title is distinct from new\.title/)
  assert.match(migrationSource, /old\.start_time is distinct from new\.start_time/)
  assert.match(migrationSource, /old\.status is distinct from new\.status/)
  assert.match(migrationSource, /old\.deleted_at is distinct from new\.deleted_at/)
})
