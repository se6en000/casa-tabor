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

import { daysOffAhead } from '../src/wall/holidays.ts'

// Jake, Oct 7: "potential long school vacation holidays like thanksgiveing / xmas, spring break florida" — from the
// district's 2026–27 calendar: a long break asked three weeks ahead as one question; single days ten days ahead.
test('the district calendar: Election Day and Veterans Day ten days out, Thanksgiving break as one week three weeks out', () => {
  const qs = holidayQuestions({ now: new Date(2026, 10, 2, 9, 0), routines, dayOffs: [], members })
  assert.deepEqual(qs.map((q) => q.text), [
    'Election Day (no school) is Tuesday — are Liv, Emme and Owen off school?',
    'Veterans Day is Wednesday — are Liv, Emme and Owen off school?',
    'Thanksgiving break is Mon Nov 23 – Fri Nov 27 — are Liv, Emme and Owen off?',
  ])
  assert.deepEqual(qs[2].answers[0].action, { type: 'days_off', ymd: '2026-11-23', until: '2026-11-27', memberIds: ['liv', 'emme', 'owen'], holiday: 'Thanksgiving break' })
  const spring = holidayQuestions({ now: new Date(2027, 2, 2), routines, dayOffs: [], members }).map((q) => q.holiday)
  assert.deepEqual(spring, ['Spring Holiday', 'Spring break'])
})

test('past the published school year, the federal holidays stand in', () => {
  assert.deepEqual(daysOffAhead('2027-08-28', '2027-09-10'), [{ from: '2027-09-06', to: '2027-09-06', name: 'Labor Day' }])
  assert.deepEqual(daysOffAhead('2026-12-15', '2027-01-05').map((o) => o.name), ['Winter break', 'No school (teacher day)'])
})
