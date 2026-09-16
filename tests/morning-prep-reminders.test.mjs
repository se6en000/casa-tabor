import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const routineIntelSource = readFileSync(
  new URL('../src/hooks/useFamilyRoutineIntelligence.ts', import.meta.url),
  'utf8',
)
const eventMutationsSource = readFileSync(
  new URL('../src/lib/eventMutations.ts', import.meta.url),
  'utf8',
)
const tomorrowWidgetSource = readFileSync(
  new URL('../src/components/canvas/widgets/TomorrowPrepWidget.tsx', import.meta.url),
  'utf8',
)

// 2026-09-15: the Bedtime Prep Checklist's "everyday" items (backpacks,
// lunch, water bottles) were removed entirely -- they were noise per live
// feedback ("that stuff happens everyday, no need to be reminded of that").
// The checklist is now backed by real, push-notifiable reminders instead of
// a synthetic day-keyed list.
test('school-day prep no longer force-adds the everyday backpacks/lunch/water items', () => {
  const schoolDayBranchStart = routineIntelSource.indexOf("dayType === 'school_day'")
  const schoolDayBranchEnd = routineIntelSource.indexOf("dayType === 'weekend'")
  const schoolDayBranch = routineIntelSource.slice(schoolDayBranchStart, schoolDayBranchEnd)
  assert.doesNotMatch(schoolDayBranch, /Backpacks & homework folders packed/)
  assert.doesNotMatch(schoolDayBranch, /Lunchboxes & morning snacks staged/)
  assert.doesNotMatch(schoolDayBranch, /item-backpacks-/)
  assert.doesNotMatch(schoolDayBranch, /item-lunch-/)
})

test('violin/sports keyword detection produces tap-to-add suggestions, not auto-added items', () => {
  const musicIdx = routineIntelSource.indexOf('item-music-')
  const suggestionsIdx = routineIntelSource.indexOf('suggestions.push(', musicIdx - 400)
  assert.ok(musicIdx !== -1, 'music keyword detection must still exist')
  assert.ok(
    suggestionsIdx !== -1 && suggestionsIdx < musicIdx + 400,
    'the music item must be pushed into suggestions, not items',
  )
})

test('createMorningPrepReminder makes a real, push-notifiable reminder tagged morning_prep', () => {
  assert.match(eventMutationsSource, /export const MORNING_PREP_CATEGORY = 'morning_prep'/)
  assert.match(eventMutationsSource, /export async function createMorningPrepReminder/)
  // A real events + event_enrichments row, not a local-only record -- this
  // is what lets it ride the existing notify-upcoming-events push cron and
  // show up in Today's To-Dos like any other reminder.
  const fnStart = eventMutationsSource.indexOf('export async function createMorningPrepReminder')
  const fnBody = eventMutationsSource.slice(fnStart, fnStart + 3000)
  assert.match(fnBody, /event_type: 'reminder'/)
  assert.match(fnBody, /category: MORNING_PREP_CATEGORY/)
  assert.match(fnBody, /6, 45, 0, 0/, 'must default to 6:45 AM')
  assert.match(fnBody, /\.from\('events'\)\.insert/)
  assert.match(fnBody, /\.from\('event_enrichments'\)\.insert/)
})

test('the standalone local-storage prep-custom-items module was removed, not kept alongside the reminder-backed design', () => {
  assert.doesNotMatch(routineIntelSource, /prepCustomItemsSync/)
})

test('the Hero checklist supports add, complete, and delete against real reminders', () => {
  assert.match(routineIntelSource, /addPrepItem: \(dateKey: string, label: string\) => Promise<void>/)
  assert.match(routineIntelSource, /removePrepItem: \(reminderId: string\) => Promise<void>/)
  assert.match(routineIntelSource, /completePrepItem: \(reminderId: string\) => Promise<void>/)

  assert.match(tomorrowWidgetSource, /addPrepItem/)
  assert.match(tomorrowWidgetSource, /removePrepItem/)
  assert.match(tomorrowWidgetSource, /completePrepItem/)
  assert.match(tomorrowWidgetSource, /prepSuggestions/)
  // Suggestion chips and the delete action must use the shared design-system
  // primitives (Chip / IconButton), not a hand-rolled <button>.
  assert.match(tomorrowWidgetSource, /<Chip\b/)
  assert.match(tomorrowWidgetSource, /<IconButton\b/)
})

test('morning_prep reminders sync in real time across devices via a live query, not local storage', () => {
  assert.match(routineIntelSource, /postgres_changes/)
  assert.match(routineIntelSource, /morning-prep-reminders/)
  assert.doesNotMatch(routineIntelSource, /localStorage.*morning.?prep/i)
})
