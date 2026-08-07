import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

// Regression: calendar surfaces (stacked 8-day cards, day-view cards, and homepage
// cards) should render the "going" attendee list as the same overlapping
// stacked-initials avatar cluster used in EventDetailPanel's header, instead of a
// per-person colored-circle-plus-text-label row (StackedView) or a row of full-name
// CalendarPills (DayView / HomePage).

test('StackedView renders going members with PersonAvatarStack, not per-row text labels', () => {
  const src = read('src/components/calendar/StackedView.tsx')
  assert.match(src, /import[^;]*PersonAvatarStack[^;]*from ['"]\.\.\/ui['"]/, 'StackedView should import PersonAvatarStack from the shared ui module')
  assert.match(src, /<PersonAvatarStack/, 'StackedView should render a PersonAvatarStack for going members')
  assert.doesNotMatch(src, /title=\{`\$\{member\.name\} going`\}/, 'the old per-member "going" text row should be removed')
})

test('DayView renders event attendees with PersonAvatarStack, not CalendarPill name lists', () => {
  const src = read('src/components/calendar/DayView.tsx')
  assert.match(src, /import[^;]*PersonAvatarStack[^;]*from ['"]\.\.\/ui['"]/, 'DayView should import PersonAvatarStack from the shared ui module')
  assert.match(src, /responsibility\.attendees[\s\S]{0,200}<PersonAvatarStack/, 'DayView attendee row should use PersonAvatarStack')
})

test('HomePage renders event attendees with PersonAvatarStack, not CalendarPill name lists', () => {
  const src = read('src/pages/HomePage.tsx')
  assert.match(src, /responsibility\.attendees[\s\S]{0,200}<PersonAvatarStack/, 'HomePage attendee row should use PersonAvatarStack')
})
