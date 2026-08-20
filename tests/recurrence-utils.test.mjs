import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseRrule,
  buildRrule,
  formatRecurrenceSummary,
  formatRecurrencePillLabel,
  expandRruleInstances,
} from '../src/utils/recurrenceUtils.ts'

test('parseRrule handles empty, null, or invalid rrule strings', () => {
  assert.deepEqual(parseRrule(null), {
    freq: 'none',
    interval: 1,
    byDay: [],
    endType: 'never',
    endDate: '',
    count: 10,
  })
  assert.deepEqual(parseRrule(''), {
    freq: 'none',
    interval: 1,
    byDay: [],
    endType: 'never',
    endDate: '',
    count: 10,
  })
  assert.deepEqual(parseRrule('INVALID=RULE'), {
    freq: 'none',
    interval: 1,
    byDay: [],
    endType: 'never',
    endDate: '',
    count: 10,
  })
})

test('parseRrule parses weekly with multiple days and until', () => {
  const result = parseRrule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20261218T235959Z')
  assert.equal(result.freq, 'weekly')
  assert.equal(result.interval, 2)
  assert.deepEqual(result.byDay, [1, 3, 5])
  assert.equal(result.endType, 'date')
  assert.equal(result.endDate, '2026-12-18')
})

test('parseRrule parses daily with count', () => {
  const result = parseRrule('FREQ=DAILY;COUNT=15')
  assert.equal(result.freq, 'daily')
  assert.equal(result.interval, 1)
  assert.equal(result.endType, 'count')
  assert.equal(result.count, 15)
})

test('buildRrule builds compliant RFC 5545 RRULE string', () => {
  assert.equal(
    buildRrule({
      freq: 'weekly',
      interval: 1,
      byDay: [5], // Friday
      endType: 'never',
      endDate: '',
      count: 10,
    }),
    'FREQ=WEEKLY;BYDAY=FR'
  )

  assert.equal(
    buildRrule({
      freq: 'weekly',
      interval: 2,
      byDay: [1, 3], // Mon, Wed
      endType: 'date',
      endDate: '2026-12-18',
      count: 10,
    }),
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261218T235959Z'
  )

  assert.equal(
    buildRrule({
      freq: 'daily',
      interval: 3,
      byDay: [],
      endType: 'count',
      endDate: '',
      count: 5,
    }),
    'FREQ=DAILY;INTERVAL=3;COUNT=5'
  )

  assert.equal(
    buildRrule({
      freq: 'none',
      interval: 1,
      byDay: [],
      endType: 'never',
      endDate: '',
      count: 10,
    }),
    null
  )
})

test('formatRecurrenceSummary produces distance-readable English descriptions', () => {
  const fridayDate = new Date('2026-08-21T16:30:00') // Friday
  assert.equal(
    formatRecurrenceSummary(
      {
        freq: 'none',
        interval: 1,
        byDay: [],
        endType: 'never',
        endDate: '',
        count: 10,
      },
      fridayDate
    ),
    'Does not repeat (One-time event)'
  )

  assert.equal(
    formatRecurrenceSummary(
      {
        freq: 'weekly',
        interval: 1,
        byDay: [5],
        endType: 'never',
        endDate: '',
        count: 10,
      },
      fridayDate
    ),
    'Repeats weekly on Friday'
  )

  assert.equal(
    formatRecurrenceSummary(
      {
        freq: 'weekly',
        interval: 2,
        byDay: [1, 3],
        endType: 'date',
        endDate: '2026-12-18',
        count: 10,
      },
      fridayDate
    ),
    'Repeats every 2 weeks on Mon, Wed, until Dec 18, 2026'
  )

  assert.equal(
    formatRecurrenceSummary(
      {
        freq: 'daily',
        interval: 1,
        byDay: [],
        endType: 'count',
        endDate: '',
        count: 10,
      },
      fridayDate
    ),
    'Repeats daily, for 10 times'
  )
})

test('formatRecurrencePillLabel produces compact badges for action chips', () => {
  const fridayDate = new Date('2026-08-21T16:30:00')
  assert.equal(
    formatRecurrencePillLabel(
      { freq: 'none', interval: 1, byDay: [], endType: 'never', endDate: '', count: 10 },
      fridayDate
    ),
    'Does not repeat'
  )

  assert.equal(
    formatRecurrencePillLabel(
      { freq: 'weekly', interval: 1, byDay: [5], endType: 'never', endDate: '', count: 10 },
      fridayDate
    ),
    'Weekly on Fri'
  )

  assert.equal(
    formatRecurrencePillLabel(
      { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5], endType: 'never', endDate: '', count: 10 },
      fridayDate
    ),
    'Weekdays'
  )

  assert.equal(
    formatRecurrencePillLabel(
      { freq: 'weekly', interval: 2, byDay: [1, 3], endType: 'never', endDate: '', count: 10 },
      fridayDate
    ),
    'Every 2w (Mon, Wed)'
  )
})

test('expandRruleInstances generates expected occurrence series without duplicating master', () => {
  const masterStart = '2026-08-21T16:30:00.000Z'
  const masterEnd = '2026-08-21T17:15:00.000Z' // 45m duration

  // Weekly on Friday, 4 occurrences
  const instances = expandRruleInstances(masterStart, masterEnd, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=FR;COUNT=4', 10)
  assert.equal(instances.length, 3) // 3 children + 1 master = 4 total

  // Check 1 week later
  assert.equal(instances[0].start, '2026-08-28T16:30:00.000Z')
  assert.equal(instances[0].end, '2026-08-28T17:15:00.000Z')

  // Check 2 weeks later
  assert.equal(instances[1].start, '2026-09-04T16:30:00.000Z')
  assert.equal(instances[1].end, '2026-09-04T17:15:00.000Z')

  // Check 3 weeks later
  assert.equal(instances[2].start, '2026-09-11T16:30:00.000Z')
  assert.equal(instances[2].end, '2026-09-11T17:15:00.000Z')
})
