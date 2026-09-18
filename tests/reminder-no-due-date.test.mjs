import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const presenterSource = readFileSync(
  new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url),
  'utf8',
)
const typesSource = readFileSync(
  new URL('../src/types/index.ts', import.meta.url),
  'utf8',
)
const mutationsSource = readFileSync(
  new URL('../src/lib/eventMutations.ts', import.meta.url),
  'utf8',
)
const heroTitleCardSource = readFileSync(
  new URL('../src/components/calendar/living-flow/components/LivingHeroTitleCard.tsx', import.meta.url),
  'utf8',
)
const reminderCardSource = readFileSync(
  new URL('../src/components/calendar/living-flow/components/LivingReminderCard.tsx', import.meta.url),
  'utf8',
)
const schemaMigrationSource = readFileSync(
  new URL('../supabase/migrations/20260917160000_reminder_has_due_date.sql', import.meta.url),
  'utf8',
)

// 2026-09-17: events always have a real date/time; reminders can be genuinely
// date-less ("just get this done" priorities). Previously the sidecar could
// only reassign a reminder's date, never remove one.

test('has_due_date column defaults true so existing events/reminders are unaffected', () => {
  assert.match(schemaMigrationSource, /add column if not exists has_due_date boolean not null default true/)
})

test('CalendarEvent type carries has_due_date', () => {
  assert.match(typesSource, /has_due_date: boolean/)
})

test('date-less reminders are never overdue and always show as an active to-do', () => {
  const overdueIdx = presenterSource.indexOf('const overdueReminders')
  const overdueBlock = presenterSource.slice(overdueIdx, overdueIdx + 500)
  assert.match(overdueBlock, /if \(evt\.has_due_date === false\) return false/)

  const activeIdx = presenterSource.indexOf('const activeReminders')
  const activeBlock = presenterSource.slice(activeIdx, activeIdx + 500)
  assert.match(activeBlock, /if \(evt\.has_due_date === false\) return true/)

  const todayIdx = presenterSource.indexOf('const todayReminders')
  const todayBlock = presenterSource.slice(todayIdx, todayIdx + 1000)
  assert.match(todayBlock, /if \(e\.has_due_date === false\) return true/)
})

test('assigning a real schedule flips has_due_date back to true', () => {
  assert.match(mutationsSource, /export async function updateEventSchedule/)
  const idx = mutationsSource.indexOf('export async function updateEventSchedule')
  const endIdx = mutationsSource.indexOf('\nexport async function updateEventVenue')
  const block = mutationsSource.slice(idx, endIdx > idx ? endIdx : idx + 3000)
  const hasDueDateMatches = block.match(/has_due_date: true/g) || []
  assert.ok(hasDueDateMatches.length >= 2, 'both the optimistic patch and the DB update must set has_due_date: true')
})

test('clearReminderDueDate exists and only touches has_due_date, not the placeholder timestamp', () => {
  assert.match(mutationsSource, /export async function clearReminderDueDate/)
  const idx = mutationsSource.indexOf('export async function clearReminderDueDate')
  const block = mutationsSource.slice(idx, idx + 700)
  assert.match(block, /has_due_date: false/)
  assert.doesNotMatch(block, /start_time:/)
})

// 2026-09-18: the first cut of this UI shipped two real bugs, found live by
// the user -- (1) the header date/time chips never checked hasDueDate at all,
// so clearing a due date looked like nothing happened; (2) the copy claimed
// this "makes it a priority", which it never did. Fixed with a proper
// Has-Due-Date/No-Due-Date toggle (not a single misleadingly-labeled button)
// that also swaps the header chips, and copy that just says what happened.
test('sidecar has a due-date toggle, gated to reminders only, with accurate (non-"priority") copy', () => {
  assert.match(heroTitleCardSource, /onClearDueDate/)
  assert.match(heroTitleCardSource, /mode === 'reminder' && onClearDueDate/)
  assert.match(heroTitleCardSource, /Has Due Date/)
  assert.match(heroTitleCardSource, /No Due Date/)
  assert.doesNotMatch(heroTitleCardSource, /priority to-do/i)
})

test('header chips reflect hasDueDate -- a single "No due date" chip replaces the date+time pair', () => {
  assert.match(heroTitleCardSource, /!dueDateEnabled \? \(/)
  assert.match(heroTitleCardSource, /No due date<\/span>/)
})

test('LivingReminderCard hides the due line when date-less, with accurate (non-"priority") copy', () => {
  assert.match(reminderCardSource, /hasDueDate/)
  assert.match(reminderCardSource, /No due date/)
  assert.doesNotMatch(reminderCardSource, /priority to-do/i)
})
