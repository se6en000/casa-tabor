import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('sync-event-to-google handles reminder conversion by deleting Google event and clearing IDs', () => {
  const syncFile = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/sync-event-to-google/index.ts'),
    'utf8',
  )
  assert.match(syncFile, /event\.event_type === 'reminder'/)
  assert.match(syncFile, /delete-google-event/)
  assert.match(syncFile, /google_event_id:\s*null/)
})

test('delete-google-event falls back to source member and writable connection and clears DB linkage', () => {
  const deleteFile = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/delete-google-event/index.ts'),
    'utf8',
  )
  assert.match(deleteFile, /family_member_id.*source_member_id/)
  assert.match(deleteFile, /access_mode.*writable/)
  assert.match(deleteFile, /google_event_id:\s*null/)
})

test('eventMutations updateEventCategory unconditionally triggers sync so reminder conversions clean up Google', () => {
  const mutationsFile = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/eventMutations.ts'),
    'utf8',
  )
  const categoryFn = mutationsFile.slice(mutationsFile.indexOf('export async function updateEventCategory'))
  assert.match(categoryFn, /triggerGoogleEventSync\(supabase,\s*eventId\)/)
})
