import test from 'node:test'
import assert from 'node:assert/strict'
import { isSameDay, startOfDay, endOfDay, subDays, addDays, parseISO } from 'date-fns'

import {
  isTodoCompletedToday,
  TODO_COMPLETIONS_SETTINGS_KEY,
  TODO_COMPLETIONS_TIMESTAMPS_SETTINGS_KEY,
  TODO_COMPLETIONS_STORAGE_KEY,
  TODO_COMPLETIONS_TIMESTAMPS_STORAGE_KEY,
} from '../src/utils/todoCompletionsSync.ts'

// Polyfill minimal localStorage for Node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

test('todoCompletionsSync constants and storage keys are correctly defined', () => {
  assert.equal(TODO_COMPLETIONS_SETTINGS_KEY, 'household_todo_completions')
  assert.equal(TODO_COMPLETIONS_TIMESTAMPS_SETTINGS_KEY, 'household_todo_completion_timestamps')
  assert.equal(TODO_COMPLETIONS_STORAGE_KEY, 'casa_household_todo_completions')
  assert.equal(TODO_COMPLETIONS_TIMESTAMPS_STORAGE_KEY, 'casa_household_todo_completion_timestamps')
})

test('isTodoCompletedToday: accurately identifies items completed today vs previous days', () => {
  const sundayMorning = new Date('2026-08-23T07:02:00-04:00')
  const saturdayNight = new Date('2026-08-22T23:30:00-04:00')

  // Setup localStorage test data
  const completions = {
    'item-completed-today': true,
    'item-completed-yesterday': true,
    'item-uncompleted': false,
    'legacy-item-scheduled-today': true,
    'legacy-item-scheduled-friday': true,
  }
  const timestamps = {
    'item-completed-today': sundayMorning.getTime(),
    'item-completed-yesterday': saturdayNight.getTime(),
  }

  localStorage.setItem(TODO_COMPLETIONS_STORAGE_KEY, JSON.stringify(completions))
  localStorage.setItem(TODO_COMPLETIONS_TIMESTAMPS_STORAGE_KEY, JSON.stringify(timestamps))

  // 1. Completed with Sunday timestamp -> true on Sunday
  assert.equal(
    isTodoCompletedToday('item-completed-today', '2026-08-23T12:00:00Z', sundayMorning),
    true,
    'Item completed with Sunday timestamp must be recognized as completed today on Sunday'
  )

  // 2. Completed with Saturday timestamp -> false on Sunday morning (Clean midnight reset!)
  assert.equal(
    isTodoCompletedToday('item-completed-yesterday', '2026-08-22T23:30:00Z', sundayMorning),
    false,
    'Item completed on Saturday must NOT be recognized as completed today on Sunday morning'
  )

  // 3. Uncompleted item -> false
  assert.equal(
    isTodoCompletedToday('item-uncompleted', '2026-08-23T12:00:00Z', sundayMorning),
    false,
    'Uncompleted item must return false'
  )

  // 4. Legacy completed item without timestamp, scheduled for today -> true
  assert.equal(
    isTodoCompletedToday('legacy-item-scheduled-today', '2026-08-23T13:00:00Z', sundayMorning),
    true,
    'Legacy item scheduled for today without timestamp falls back to true for today'
  )

  // 5. Legacy completed item without timestamp, scheduled for Friday -> false on Sunday (Clean midnight reset!)
  assert.equal(
    isTodoCompletedToday('legacy-item-scheduled-friday', '2026-08-21T14:00:00Z', sundayMorning),
    false,
    'Legacy item scheduled for Friday must NOT appear as completed today on Sunday'
  )
})

test('Midnight Reset Scenario: Sunday 7:02 AM with 2 open tasks and 10 past completed tasks', () => {
  const sunday702AM = new Date('2026-08-23T07:02:00-04:00')
  const todayEnd = endOfDay(sunday702AM)

  // 10 reminders from past days (Thursday, Friday, Saturday) that were marked complete
  const pastReminders = [
    { id: 'rem-1', title: 'PTSA Family Membership', start_time: '2026-08-20T20:00:00Z', event_type: 'reminder' },
    { id: 'rem-2', title: 'Order Graphics for Skating Shirts', start_time: '2026-08-20T16:55:00Z', event_type: 'reminder' },
    { id: 'rem-3', title: 'Fix the Office Fan', start_time: '2026-08-20T12:00:00Z', event_type: 'reminder' },
    { id: 'rem-4', title: 'Liv Meds', start_time: '2026-08-21T23:00:00Z', event_type: 'reminder' },
    { id: 'rem-5', title: 'Pack Liv strawberries', start_time: '2026-08-21T10:20:00Z', event_type: 'reminder' },
    { id: 'rem-6', title: 'Order Coaches Graphics from Jiffy', start_time: '2026-08-21T13:00:00Z', event_type: 'reminder' },
    { id: 'rem-7', title: 'Call Bak - Schedule Liv Pickup', start_time: '2026-08-21T14:00:00Z', event_type: 'reminder' },
    { id: 'rem-8', title: 'Mow the lawn', start_time: '2026-08-21T16:00:00Z', event_type: 'reminder' },
    { id: 'rem-9', title: "Liv's Doc Apt P.A. PGA", start_time: '2026-08-21T19:40:00Z', event_type: 'reminder' },
    { id: 'rem-10', title: 'Install a new truck battery', start_time: '2026-08-22T23:30:00Z', event_type: 'reminder' },
  ]

  // 2 open reminders scheduled for Sunday
  const sundayReminders = [
    { id: 'sun-1', title: 'Get hamster food', start_time: '2026-08-23T12:00:00Z', event_type: 'reminder' },
    { id: 'sun-2', title: 'Landscaping Cleanup', start_time: '2026-08-23T13:00:00Z', event_type: 'reminder' },
  ]

  const rollingEvents = [...pastReminders, ...sundayReminders]

  // Completions map having all 10 past reminders completed
  const completedMap = {
    'rem-1': true,
    'rem-2': true,
    'rem-3': true,
    'rem-4': true,
    'rem-5': true,
    'rem-6': true,
    'rem-7': true,
    'rem-8': true,
    'rem-9': true,
    'rem-10': true,
  }

  localStorage.setItem(TODO_COMPLETIONS_STORAGE_KEY, JSON.stringify(completedMap))
  localStorage.setItem(TODO_COMPLETIONS_TIMESTAMPS_STORAGE_KEY, JSON.stringify({}))

  // Derived todayReminders filtering
  const todayReminders = rollingEvents.filter((e) => {
    const startDate = parseISO(e.start_time)
    const isCompleted = Boolean(completedMap[e.id])
    if (isCompleted) {
      return isTodoCompletedToday(e.id, startDate, sunday702AM)
    }
    return startDate < todayEnd || isSameDay(startDate, sunday702AM)
  })

  const openReminders = todayReminders.filter((e) => !completedMap[e.id])
  const completedReminders = todayReminders.filter((e) => Boolean(completedMap[e.id]))

  // Assertions for Sunday morning at 7:02 AM:
  assert.equal(openReminders.length, 2, 'Must have exactly 2 open to-dos for Sunday')
  assert.equal(completedReminders.length, 0, 'Completed Today count MUST be 0 at 7:02 AM (Midnight reset verified)')
  assert.equal(todayReminders.length, 2, 'Today reminders must equal open (2) + completed (0)')
})

test('Midnight Roll-Over: Completing an item on Sunday increments completed to 1, then resets to 0 on Monday', () => {
  const sundayNoon = new Date('2026-08-23T12:00:00-04:00')
  const mondayMorning = new Date('2026-08-24T07:00:00-04:00')

  const sundayEvent = {
    id: 'sun-1',
    title: 'Get hamster food',
    start_time: '2026-08-23T12:00:00Z',
    event_type: 'reminder',
  }
  const mondayEvent = {
    id: 'mon-1',
    title: 'Pick up dry cleaning',
    start_time: '2026-08-24T14:00:00Z',
    event_type: 'reminder',
  }

  const rollingEvents = [sundayEvent, mondayEvent]

  // User checks off Sunday item at 12:30 PM on Sunday
  const completions = { 'sun-1': true }
  const timestamps = { 'sun-1': new Date('2026-08-23T12:30:00-04:00').getTime() }
  localStorage.setItem(TODO_COMPLETIONS_STORAGE_KEY, JSON.stringify(completions))
  localStorage.setItem(TODO_COMPLETIONS_TIMESTAMPS_STORAGE_KEY, JSON.stringify(timestamps))

  // 1. Evaluated on Sunday afternoon:
  const sundayFilter = (e) => {
    const startDate = parseISO(e.start_time)
    const isCompleted = Boolean(completions[e.id])
    if (isCompleted) {
      return isTodoCompletedToday(e.id, startDate, sundayNoon)
    }
    return startDate < endOfDay(sundayNoon) || isSameDay(startDate, sundayNoon)
  }
  const sundayRemindersList = rollingEvents.filter(sundayFilter)
  const sundayCompleted = sundayRemindersList.filter((e) => Boolean(completions[e.id]))
  assert.equal(sundayCompleted.length, 1, 'Completed Today on Sunday must be 1')
  assert.equal(sundayCompleted[0].title, 'Get hamster food')

  // 2. Evaluated on Monday morning after midnight:
  const mondayFilter = (e) => {
    const startDate = parseISO(e.start_time)
    const isCompleted = Boolean(completions[e.id])
    if (isCompleted) {
      return isTodoCompletedToday(e.id, startDate, mondayMorning)
    }
    return startDate < endOfDay(mondayMorning) || isSameDay(startDate, mondayMorning)
  }
  const mondayRemindersList = rollingEvents.filter(mondayFilter)
  const mondayCompleted = mondayRemindersList.filter((e) => Boolean(completions[e.id]))
  const mondayOpen = mondayRemindersList.filter((e) => !completions[e.id])

  assert.equal(mondayCompleted.length, 0, 'Completed Today on Monday MUST reset to 0 at midnight')
  assert.equal(mondayOpen.length, 1, 'Monday has 1 open item (Pick up dry cleaning)')
  assert.equal(mondayOpen[0].title, 'Pick up dry cleaning')
})
