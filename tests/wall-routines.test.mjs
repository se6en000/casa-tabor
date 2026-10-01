import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deserializeRoutinesFromAvailabilityRules, deserializeRoutineFromAvailabilityRules, serializeRoutineToAvailabilityRules, routineKeyOfRule,
} from '../src/lib/familyRoutines.ts'
import { buildDayPlan } from '../src/wall/engine/dayPlan.ts'
import { buildScore } from '../src/wall/score.ts'
import {
  cannotSave, daysLabel, daysOffLine, newRoutine, overrideLines, routineDetail, routineHeadline, setDriver, stepHours, toggleDay, yearLine,
  putOverride, overrideFor,
} from '../src/wall/routines.ts'
import { FRIDAY, at, members, routines, events } from './fixtures/wall-day-2026-09-25.mjs'

// Canvas row 16: routines — several per person, Work from the plain working hours, "Hide routines", the page's lines.

const school = JSON.stringify({ type: 'family_routine', routineType: 'school', title: 'School Routine', venueName: 'Palm Beach Public Elementary School', venueAddress: '239 Cocoanut Row', dropoffDriverName: 'Jake', pickupDriverName: 'Giselle', enabled: true })
const rule = (member_id, day, start, end, reason, extra = {}) => ({ id: `${member_id}-${day}-${reason.length}-${start}`, member_id, day_of_week: day, start_local: `${start}:00`, end_local: `${end}:00`, availability_type: 'unavailable', reason, timezone: 'America/New_York', created_at: '2026-09-01', updated_at: '2026-09-01', ...extra })

test('a person\'s rules read as all their routines: the older keyless one is "main", a keyed one is its own', () => {
  const piano = serializeRoutineToAvailabilityRules({ ...newRoutine('class', 'owen', [{ key: 'main' }], 1), title: 'Piano', venueName: 'Mrs. Lee', daysOfWeek: [3] })
  const rules = [rule('owen', 1, '07:35', '14:00', school), rule('owen', 2, '07:35', '14:00', school), ...piano.map((r, i) => ({ ...r, id: `p${i}`, created_at: '2026-09-02', updated_at: '2026-09-02' }))]
  const all = deserializeRoutinesFromAvailabilityRules('owen', rules)
  assert.deepEqual(all.map((r) => [r.key, r.title, r.daysOfWeek]), [['main', 'School Routine', [1, 2]], [piano[0] && JSON.parse(piano[0].reason).key, 'Piano', [3]]])
  // The old screens still get the main one.
  assert.equal(deserializeRoutineFromAvailabilityRules('owen', rules).title, 'School Routine')
  assert.equal(routineKeyOfRule({ reason: school }), 'main')
  assert.equal(routineKeyOfRule({ reason: 'Working hours' }), null)
})

test('plain "Working hours" rows read as a Work routine: the usual hours, a day that differs, no drivers', () => {
  const rules = [1, 2, 3, 4].map((d) => rule('kelly', d, '07:30', '18:30', 'Working hours')).concat(rule('kelly', 5, '07:30', '15:00', 'Working hours'))
  const [work] = deserializeRoutinesFromAvailabilityRules('kelly', rules)
  assert.equal(work.key, 'work-hours')
  assert.equal(work.routineType, 'work')
  assert.deepEqual([work.startLocal, work.endLocal, work.daysOfWeek], ['07:30', '18:30', [1, 2, 3, 4, 5]])
  assert.deepEqual(work.dayOverrides.map((o) => [o.dayOfWeek, o.endLocal]), [[5, '15:00']])
  assert.equal(work.dropoffDriverName, '')
  assert.equal(routineHeadline(work), 'Work')
  assert.equal(routineDetail(work), 'Weekdays 7:30–6:30')
  assert.deepEqual(overrideLines(work), ['Fridays: out at 3:00'])
  // An "available" row isn't work.
  assert.deepEqual(deserializeRoutinesFromAvailabilityRules('kelly', [rule('kelly', 6, '10:00', '11:00', 'Free', { availability_type: 'available' })]), [])
})

const kellyWork = { key: 'work-hours', memberId: 'kelly', title: 'Work', routineType: 'work', venueName: '', venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: '07:30', endLocal: '18:30', dropoffDriverName: '', pickupDriverName: '', enabled: true }

test('work is a block on the lane, with no drop-off or pickup runs, and gives way to their own drive in the morning', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines: [...routines, kellyWork], events })
  const kelly = plan.lanes.get('kelly')
  const work = kelly.find((s) => s.work)
  assert.equal(work.label, 'Work')
  assert.equal(plan.trips.some((t) => t.title.includes('Kelly') && t.source === 'routine' && t.travelerIds.includes('kelly')), false)
  // Kelly drives Liv to Bak for 8:00; work starts when she's done with that drive.
  const drive = kelly.find((s) => s.kind === 'drive' && s.driverId === 'kelly')
  assert.equal(work.start.getTime(), drive.end.getTime())
  assert.equal(work.end.getTime(), at(25, 18, 30).getTime())
  assert.equal(plan.gaps.some((g) => /Kelly/.test(g.title)), false)
  const score = buildScore(plan, members, at(25, 12, 0))
  assert.equal(score.lanes.find((l) => l.member.id === 'kelly').status, 'Work · until 6:30')
})

test('"Hide routines" takes school, work and the regular runs off the lanes; the status still says where they are', () => {
  const plan = buildDayPlan({ date: FRIDAY, members, routines: [...routines, kellyWork], events })
  const shown = buildScore(plan, members, at(25, 10, 8))
  const hidden = buildScore(plan, members, at(25, 10, 8), { hideRoutines: true })
  const liv = (s) => s.lanes.find((l) => l.member.id === 'liv')
  assert.ok(liv(shown).blocks.some((b) => b.kind === 'place'))
  assert.equal(liv(hidden).blocks.some((b) => b.kind === 'place'), false)
  assert.deepEqual(liv(hidden).monograms, [])
  assert.equal(hidden.lanes.find((l) => l.member.id === 'giselle').blocks.length, 0)
  assert.equal(hidden.lanes.find((l) => l.member.id === 'kelly').blocks.some((b) => b.label === 'Work'), false)
  assert.equal(liv(hidden).status, liv(shown).status)
  // Calendar things stay.
  const emme = (s) => s.lanes.find((l) => l.member.id === 'emme').blocks.filter((b) => b.sourceId === 'violin')
  assert.equal(emme(hidden).length, emme(shown).length)
})

test('with routines hidden, a run that needs someone or was handed off today still shows', () => {
  const noPickup = routines.map((r) => (r.memberId === 'liv' ? { ...r, pickupDriverName: '' } : r))
  const plan = buildDayPlan({ date: FRIDAY, members, routines: noPickup, events })
  const hidden = buildScore(plan, members, at(25, 10, 8), { hideRoutines: true })
  assert.ok(hidden.lanes.find((l) => l.member.id === 'liv').blocks.some((b) => b.kind === 'drive_unassigned'))
  const pickup = plan.trips.find((t) => t.title === 'Pick up Emme & Owen')
  const handed = buildDayPlan({ date: FRIDAY, members, routines, events, tripState: { drivers: { [pickup.id]: 'kelly' }, departed: {} } })
  const kelly = buildScore(handed, members, at(25, 10, 8), { hideRoutines: true }).lanes.find((l) => l.member.id === 'kelly')
  assert.ok(kelly.blocks.some((b) => b.kind === 'drive' && b.label === 'Pick up Emme & Owen'))
})

test('the page says a routine in plain words', () => {
  const owen = { ...routines[2], key: 'main', startLocal: '07:35', endLocal: '14:00', dropoffDriverName: 'Jake', pickupDriverName: 'Giselle' }
  assert.equal(routineHeadline(owen), 'School · Palm Beach Public')
  assert.equal(routineDetail(owen), 'Weekdays 7:35–2:00 · Jake drops off, Giselle picks up')
  assert.equal(routineDetail({ ...owen, pickupDriverName: 'Jake', daysOfWeek: [1, 3] }), 'Mon, Wed 7:35–2:00 · Jake drives')
  const emme = routines[1]
  assert.deepEqual(overrideLines(emme), ['Tuesdays: in at 7:00 (Early Beethoven Strings)'])
  assert.deepEqual(overrideLines(putOverride(owen, { ...overrideFor(owen, 3), endLocal: '13:00' })), ['Wednesdays: out at 1:00'])
  assert.deepEqual(overrideLines(putOverride(owen, { ...overrideFor(owen, 5), pickupDriverName: 'Kelly' })), ['Fridays: Kelly picks up'])
  assert.equal(yearLine({ ...owen, startDate: '2026-08-10', endDate: '2027-05-28' }), 'Aug 10, 2026 – May 28, 2027')
  assert.equal(yearLine(owen), 'All year')
  assert.equal(daysLabel([0, 6]), 'Weekends')
  assert.equal(daysOffLine([{ start: '2026-10-12', end: '2026-10-12' }, { start: '2026-11-11', end: '2026-11-11' }, { start: '2026-11-23', end: '2026-11-27' }, { start: '2026-12-21', end: '2027-01-01' }]), 'Oct 12 · Nov 11 · Nov 23–27 · 1 more')
})

test('the editor\'s changes: days, hours by five minutes (never past the other end), drivers, and what\'s missing', () => {
  const r = newRoutine('school', 'owen', [])
  assert.equal(r.key, 'main')
  assert.equal(newRoutine('work', 'jake-id', [r]).key, 'work-hours')
  assert.match(newRoutine('class', 'owen', [r], 1234).key, /^class-/)
  assert.equal(cannotSave(r), 'Where is it?')
  assert.deepEqual(toggleDay(r, 3).daysOfWeek, [1, 2, 4, 5])
  assert.equal(cannotSave(toggleDay(toggleDay(toggleDay(toggleDay(toggleDay({ ...r, venueName: 'X' }, 1), 2), 3), 4), 5)), 'Pick at least one day.')
  assert.equal(stepHours(r, 'start', -25).startLocal, '07:35')
  assert.equal(stepHours({ ...r, endLocal: '08:10' }, 'start', 60).startLocal, '08:05')
  assert.equal(stepHours(r, 'end', -15).endLocal, '14:45')
  assert.deepEqual([setDriver(r, 'pickup', { id: 'giselle', name: 'Giselle' }).pickupDriverName, setDriver(r, 'pickup', null).pickupDriverName], ['Giselle', ''])
  assert.equal(cannotSave({ ...r, venueName: 'Bak' }), null)
})
