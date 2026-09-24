import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const presenter = read('src/hooks/useCalmKioskPresenter.ts')
const todaysSchedule = read('src/components/canvas/widgets/TodaysScheduleWidget.tsx')
const tomorrowPreview = read('src/components/canvas/widgets/TomorrowPreviewWidget.tsx')
const calmKioskView = read('src/components/canvas/CalmKioskView.tsx')
const stackedView = read('src/components/calendar/StackedView.tsx')

// 2026-09-24: a reminder with a real due date+time today/tomorrow now joins Today's
// Schedule / Tomorrow's Schedule (living-canvas), chronologically with real events --
// matching how StackedView already treats a timed reminder as part of the day's
// timeline rather than hiding it in the to-do list. A date-less or all-day reminder
// still stays To-Do-list-only. Uses the calendar's own CompactReminderCard (amber,
// lighter-weight than EventCard) -- not EventCard -- since a reminder isn't a
// hard-scheduled commitment with location/duration/attendees.

test('CompactReminderCard is shared between StackedView and the calendar module, not duplicated', () => {
  assert.match(stackedView, /import CompactReminderCard from '\.\/CompactReminderCard'/)
  assert.doesNotMatch(stackedView, /^function CompactReminderCard/m, 'the old local definition should be gone')
})

test('the presenter derives today/tomorrow timed-reminder arrays using isTimedReminder, not a hand-rolled check', () => {
  assert.match(presenter, /import \{ isTimedReminder \} from '\.\.\/utils\/holidays'/)
  assert.match(presenter, /const todayTimedReminders = useMemo/)
  assert.match(presenter, /const tomorrowTimedReminders = useMemo/)
  assert.match(presenter, /isTimedReminder\(evt\)/)
})

test('tomorrowEventsSorted excludes reminders, so a reminder never double-renders as a full EventCard', () => {
  const block = presenter.slice(presenter.indexOf('const tomorrowEventsSorted'), presenter.indexOf('const tomorrowEventsSorted') + 600)
  assert.match(block, /isReminderOrChore/)
})

for (const [label, src] of [
  ['TodaysScheduleWidget', todaysSchedule],
  ['TomorrowPreviewWidget', tomorrowPreview],
]) {
  test(`${label} accepts a reminders prop and renders it via CompactReminderCard`, () => {
    assert.match(src, /reminders: EventWithDetails\[\]/)
    assert.match(src, /import CompactReminderCard from '..\/..\/calendar\/CompactReminderCard'/)
    assert.match(src, /evt\.event_type === 'reminder'/)
    assert.match(src, /<CompactReminderCard/)
    assert.match(src, /<EventCard/, 'real events should still render via EventCard')
  })
}

test('CalmKioskView threads todayTimedReminders/tomorrowTimedReminders into the two widgets', () => {
  const todaysCall = calmKioskView.slice(calmKioskView.indexOf('<TodaysScheduleWidget'), calmKioskView.indexOf('<TodaysScheduleWidget') + 400)
  const tomorrowCall = calmKioskView.slice(calmKioskView.indexOf('<TomorrowPreviewWidget'), calmKioskView.indexOf('<TomorrowPreviewWidget') + 400)
  assert.match(todaysCall, /reminders=\{todayTimedReminders\}/)
  assert.match(tomorrowCall, /reminders=\{tomorrowTimedReminders\}/)
})
