import test from 'node:test'
import assert from 'node:assert/strict'
import { holidayQuestions, usHolidays } from '../src/wall/holidays.ts'
import { members, routines } from './fixtures/wall-day-2026-09-25.mjs'

test('US holidays, observed: Columbus Day 2026 is Mon Oct 12; July 4 2026 (a Saturday) is kept Fri Jul 3', () => {
  const h = Object.fromEntries(usHolidays(2026).map((x) => [x.name, x.ymd]))
  assert.equal(h['Columbus Day'], '2026-10-12')
  assert.equal(h['Independence Day'], '2026-07-03')
  assert.equal(h['Thanksgiving'], '2026-11-26')
  assert.equal(h['the day after Thanksgiving'], '2026-11-27')
  assert.equal(h['Veterans Day'], '2026-11-11')
  assert.equal(h['Martin Luther King Jr. Day'], '2026-01-19')
})

const care = { id: 'owen-giselle', key: 'care-giselle', memberId: 'owen', title: 'With Giselle', routineType: 'care', venueName: '', venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: '14:00', endLocal: '17:00', dropoffDriverName: '', pickupDriverName: 'Giselle', enabled: true }
const off = (memberId, note = 'Day off') => ({ member_id: memberId, override_type: 'day_off', start_at: new Date(2026, 9, 12, 0, 0).toISOString(), end_at: new Date(2026, 9, 12, 23, 59).toISOString(), note })
const ask = (extra) => holidayQuestions({ now: new Date(2026, 9, 5, 9, 0), routines: [...routines, care], dayOffs: [], members, ...extra })

test('ten days ahead of Columbus Day: are the kids off? — They’re off marks all three', () => {
  const [q] = ask()
  assert.equal(q.kind, 'holiday_off')
  assert.equal(q.text, 'Columbus Day is Monday — are Liv, Emme and Owen off school?')
  assert.deepEqual(q.answers.map((a) => a.label), ['They’re off', 'School’s open'])
  assert.deepEqual(q.answers[0].action, { type: 'days_off', ymd: '2026-10-12', memberIds: ['liv', 'emme', 'owen'], holiday: 'Columbus Day' })
  assert.deepEqual(holidayQuestions({ now: new Date(2026, 9, 1), routines, dayOffs: [], members }), [], 'eleven days out: not yet')
  assert.deepEqual(ask({ dismissed: new Set(['holiday-off:2026-10-12']) }), [], 'School’s open: not asked again')
})

test('once they’re off: who has them? — Giselle, who has Owen most afternoons, first; named once, never again', () => {
  const [q] = ask({ dayOffs: [off('liv'), off('emme'), off('owen')] })
  assert.equal(q.kind, 'holiday_cover')
  assert.equal(q.text, 'Liv, Emme and Owen are home Monday for Columbus Day — who has them?')
  assert.deepEqual(q.answers.map((a) => a.label), ['Giselle has them', 'We’ve got it'])
  assert.deepEqual(ask({ dayOffs: [off('liv', 'Columbus Day · Giselle has them'), off('emme', 'Columbus Day · Giselle has them'), off('owen', 'Columbus Day · Giselle has them')] }), [])
})
