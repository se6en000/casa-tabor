import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')

test('EventEditSheet falls back to props.event when detailQuery has an error instead of blocking the user', () => {
  // Must render EventEditSheetContent when open, even if detailQuery.isError is true or detailQuery.data is missing
  assert.match(
    source,
    /detailQuery\.data \|\| detailQuery\.isError/,
    'must render editor content on detailQuery data OR error fallback'
  )
  assert.match(
    source,
    /<EventEditSheetContent[\s\S]*?event=\{detailQuery\.data \?\? props\.event\}/,
    'must pass fallback event to EventEditSheetContent'
  )
})

test('handleDelete gracefully handles Google Calendar 404/not found errors so Casa deletion still succeeds', () => {
  assert.match(
    source,
    /delete-google-event/,
    'must invoke delete-google-event function'
  )
  // Ensure that if googleDelete fails with 404 or event not found, it does not prevent Casa delete
  assert.match(
    source,
    /googleDelete\.error[\s\S]*?(?:404|not found|notFound|status === 404)/i,
    'must tolerate 404 / already-deleted errors from delete-google-event'
  )
})

test('inline error and loading states have an explicit close/dismiss escape hatch', () => {
  assert.match(
    source,
    /onClick=\{props\.onClose\}/,
    'must provide onClose handler in error or presentation views'
  )
})
