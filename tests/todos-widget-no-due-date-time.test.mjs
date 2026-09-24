import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const src = readFileSync(new URL('../src/components/canvas/widgets/TodaysTodosWidget.tsx', import.meta.url), 'utf8')

// 2026-09-24: a reminder created with no due date (has_due_date: false) still had
// SOME start_time value under the hood (a default, not a real user choice), and this
// widget formatted it as a real clock time regardless -- e.g. "12:00 AM Call Anthony
// about house insurance alternatives", implying a 12am deadline nobody set. The app
// already has the real signal for this (has_due_date, used correctly elsewhere --
// e.g. overdueReminders in useCalmKioskPresenter.ts already excludes has_due_date:
// false items with "there's no date to have missed"); this widget just never checked
// it before rendering a time.
test('active and completed to-do rows show "Anytime" instead of a fake time for has_due_date: false items', () => {
  const completedBlockStart = src.indexOf("pt-2 border-t border-casa-border/40")
  const activeSection = src.slice(src.indexOf('{activeReminders.length > 0 && ('), completedBlockStart)
  const completedSection = src.slice(completedBlockStart)
  for (const [label, section] of [['active', activeSection], ['completed', completedSection]]) {
    assert.match(section, /evt\.has_due_date === false/, `${label} section should check has_due_date`)
    assert.match(section, /Anytime/, `${label} section should have an "Anytime" label for date-less reminders`)
  }
})

test('a timed reminder with a real due date still shows its actual time (regression guard)', () => {
  // Both branches (has_due_date true, all_day false) must still hit the h:mm formatter.
  const occurrences = (src.match(/format\(parseISO\(evt\.start_time\), 'h:mm a'\)/g) ?? []).length
  assert.ok(occurrences >= 2, 'the real per-row time formatting should still exist for dated/timed reminders')
})
