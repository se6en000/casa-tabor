import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: continuing the kiosk scroll-jank thread (see
// casa_tabor_pi_ux_lag_investigation memory) after the user reported a
// genuinely different symptom -- a ~250-500ms delay between touching down
// and the screen recognizing a scroll gesture, distinct from the per-frame
// jank already fixed (Hero drag, EventCard layout, 10s re-render churn).
// A delay specifically at gesture START (not during) points at touch-action
// / gesture-recognition-region cost rather than render cost.
//
// Found: EventCard's and CompactReminderCard's "full/grid" variants
// unconditionally declared `touch-pan-x touch-pan-y`, meaning every single
// rendered card established its OWN 2-axis touch-action region, nested
// inside whatever ancestor scroll container it lived in. That's only
// actually needed in StackedView, where day columns scroll horizontally
// past each other (touch-pan-x) while each column's own event list scrolls
// vertically (touch-pan-y) -- a genuine 2-axis disambiguation need. Every
// other consumer (the homepage's Today's/Tomorrow's Schedule, and classic
// HomePage.tsx) is a plain single-axis vertical list with no horizontal
// scroll anywhere in its ancestor chain, so touch-pan-x there was pure
// redundant per-card touch-action-region overhead. Made it an explicit,
// opt-in prop (enableHorizontalPan, default false) instead of unconditional,
// with only StackedView opting in.
const eventCardSrc = readFileSync(new URL('../src/components/calendar/EventCard.tsx', import.meta.url), 'utf8')
const reminderCardSrc = readFileSync(new URL('../src/components/calendar/CompactReminderCard.tsx', import.meta.url), 'utf8')
const stackedViewSrc = readFileSync(new URL('../src/components/calendar/StackedView.tsx', import.meta.url), 'utf8')
const todaysScheduleSrc = readFileSync(new URL('../src/components/canvas/widgets/TodaysScheduleWidget.tsx', import.meta.url), 'utf8')
const tomorrowPreviewSrc = readFileSync(new URL('../src/components/canvas/widgets/TomorrowPreviewWidget.tsx', import.meta.url), 'utf8')

test('EventCard and CompactReminderCard accept enableHorizontalPan, defaulting to false', () => {
  assert.match(eventCardSrc, /enableHorizontalPan\?: boolean/)
  assert.match(eventCardSrc, /enableHorizontalPan = false/)
  assert.match(reminderCardSrc, /enableHorizontalPan\?: boolean/)
  assert.match(reminderCardSrc, /enableHorizontalPan = false/)
})

test('neither card unconditionally declares touch-pan-x anymore', () => {
  assert.doesNotMatch(eventCardSrc, /touch-pan-x touch-pan-y/)
  assert.doesNotMatch(reminderCardSrc, /touch-pan-x touch-pan-y/)
  assert.match(eventCardSrc, /enableHorizontalPan && 'touch-pan-x'/)
  assert.match(reminderCardSrc, /enableHorizontalPan && 'touch-pan-x'/)
})

test('StackedView (the only genuinely 2-axis consumer) opts in at all 3 of its call sites', () => {
  const matches = [...stackedViewSrc.matchAll(/enableHorizontalPan\s*$/gm)]
  assert.equal(matches.length, 3, `expected StackedView to pass enableHorizontalPan at exactly 3 call sites, found ${matches.length}`)
})

test('the homepage widgets do NOT opt into horizontal pan -- they rely on the safe default', () => {
  assert.doesNotMatch(todaysScheduleSrc, /enableHorizontalPan/)
  assert.doesNotMatch(tomorrowPreviewSrc, /enableHorizontalPan/)
})
