import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260918000000_todo_reminder_casa_edit_tracking.sql', import.meta.url),
  'utf8',
)

// Real bug found 2026-09-17/18 and verified against live data: once a
// reminder synced in from iOS, any Casa-side edit (or incidental automation)
// never flipped event_ios_reminder_links.last_modified_source back to
// 'casa', so get_todo_reminder_deltas's echo-loop filter (last_modified_source
// <> 'ios') permanently excluded it from ever being re-exported to iOS.
// Verified live: the trigger correctly flips to 'casa' on any events update,
// and upsert_todo_reminder_from_ios's own subsequent write still wins back to
// 'ios' for genuine iOS-origin syncs (echo-loop protection intact).
test('an AFTER UPDATE trigger on events resets the linked row to casa-origin', () => {
  assert.match(migrationSource, /create trigger event_ios_link_casa_origin_on_update/)
  assert.match(migrationSource, /after update on public\.events/)
  assert.match(migrationSource, /set last_modified_source = 'casa'/)
})
