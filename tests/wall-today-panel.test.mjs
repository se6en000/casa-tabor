import test from 'node:test'
import assert from 'node:assert/strict'
import { nextOutHeading, panelThen, panelTodos, quickSteps, rowDetail, todoHeading } from '../src/wall/todayPanel.ts'

// Canvas 79R/79S (Jake, Oct 8: "lets unify this experience"): one panel on every face — NEXT, THEN, TO DO.
const at = (h, m = 0) => new Date(2026, 8, 25, h, m)
const job = (id, h, m, title, extra = {}) => ({ key: `chore:${id}`, kind: 'chore', id, at: at(h, m), title, whoId: 'liv', state: 'later', tag: null, meridiem: null, ...extra })
const todo = (id, title, extra = {}) => ({ id, title, shape: 'quick', minutes: 15, costCents: null, nextStep: null, needs: [], due: null, overdue: false, snoozedUntil: null, snoozeCount: 0, projectId: null, suggestion: null, ...extra })
const then = (key, h, title) => ({ key, kind: 'move', at: at(h), whoId: 'giselle', title, routine: true, before: false, sourceId: key })

test('THEN: runs and comings-and-goings in time order, three, then "+N later"', () => {
  const r = panelThen([then('a', 13, 'Pick up Emme & Owen'), then('b', 15, 'Pick up Liv')], [{ key: 'work:kelly', at: at(18, 30), title: 'Kelly off work', whoId: 'kelly' }, { key: 'out:kelly', at: at(19), title: 'Kelly at the gym until 9:30', whoId: 'kelly' }])
  assert.deepEqual(r.shown.map((i) => i.title), ['Pick up Emme & Owen', 'Pick up Liv', 'Kelly off work'])
  assert.equal(r.more, 1)
})

test('TO DO: late or within four hours first; quick ones fill a quiet stretch; 7 PM is not in a 7 AM panel', () => {
  const jobs = [job('meds', 19, 0, 'Give Liv her meds'), job('trash', 20, 0, 'Trash out to the street', { whoId: null })]
  const quick = [todo('vet', 'Call the vet', { nextStep: 'Call the vet to book a visit' }), todo('anthony', 'Call Anthony'), todo('pool', 'Look for a cable to fix the pool')]
  assert.deepEqual(panelTodos(jobs, quick, at(7, 12), { room: 2, quickRoom: 1 }).map((r) => r.title), ['Call the vet to book a visit'])
  assert.deepEqual(panelTodos(jobs, quick, at(11, 40), { room: 3, quickRoom: 3 }).map((r) => r.title), ['Call the vet to book a visit', 'Call Anthony', 'Look for a cable to fix the pool'])
  const evening = panelTodos(jobs.map((j) => ({ ...j, state: 'late' })), quick, at(20, 15), { room: 4, quickRoom: 0 })
  assert.deepEqual(evening.map((r) => [r.title, r.late, Boolean(r.job)]), [['Give Liv her meds', true, true], ['Trash out to the street', true, true]])
  // A quick one that's also a timed job isn't there twice.
  assert.deepEqual(panelTodos([job('vet', 17, 0, 'Call the vet')], [todo('vet', 'Call the vet')], at(16), { room: 3, quickRoom: 3 }).map((r) => r.key), ['chore:vet'])
})

test('quick ones must fit before the next car out, ten minutes kept', () => {
  const list = { nextUp: [todo('a', 'A', { minutes: 20 }), todo('b', 'B', { minutes: 15 }), todo('c', 'C', { shape: 'fix', minutes: 10 })] }
  assert.deepEqual(quickSteps(list, at(13, 25), at(13, 50), 3).map((t) => t.id), ['b'])
  assert.deepEqual(quickSteps(list, at(11, 40), at(13, 50), 3).map((t) => t.id), ['a', 'b'])
})

test('TO DO says how long the quiet stretch is; TONIGHT from 5 PM', () => {
  assert.equal(todoHeading(at(11, 40), 130), 'TO DO · 2 HR FREE')
  assert.equal(todoHeading(at(13, 0), 45), 'TO DO · 45 MIN FREE')
  assert.equal(todoHeading(at(7, 12), 13), 'TO DO')
  assert.equal(todoHeading(at(17, 20), null), 'TO DO TONIGHT')
})

test('NEXT has one heading form: NEXT OUT · time · in N', () => {
  assert.equal(nextOutHeading({ status: 'upcoming', leaveTime: '7:25', ring: { value: '13', unit: 'MIN', fraction: 0.2 }, eyebrow: 'NEXT MOVE · LEAVE BY 7:25' }), 'NEXT OUT · 7:25 · IN 13 MIN')
  assert.equal(nextOutHeading({ status: 'upcoming', leaveTime: '1:50', ring: { value: '2:10', unit: 'HRS', fraction: 1 }, eyebrow: 'x' }), 'NEXT OUT · 1:50 · IN 2 HR 10 MIN')
  assert.equal(nextOutHeading({ status: 'en_route', leaveTime: null, ring: null, eyebrow: 'ON THE ROAD' }), 'ON THE ROAD')
})

// Canvas 80D (Jake, Oct 8: "ok 80D"): an icon for every row; a second line only where it says something new.
test('what each to-do is: a chore just its icon; a step its project and progress; a reminder who added it; a to-do what it is part of', () => {
  const now = at(16, 40)
  const jobs = [
    job('meds', 19, 0, 'Give Liv her meds'),
    { ...job('paint', 19, 30, 'Pick colours: 3 sample pots', { whoId: null }), key: 'todo:paint', kind: 'todo', todoKind: 'step', project: { id: 'pr', title: 'Paint the house', step: 4, of: 9 } },
    { ...job('trash', 20, 0, 'Trash out to the street', { whoId: null }), key: 'todo:trash', kind: 'todo', todoKind: 'reminder', origin: { via: 'alexa', where: 'wall', text: null, at: new Date(2026, 8, 24, 16, 26).toISOString() } },
  ]
  const quick = [todo('vet', 'Bring Gilbert to the vet', { nextStep: 'Call the vet to book a visit' })]
  const rows = panelTodos(jobs, quick, now, { room: 4, quickRoom: 1 })
  assert.deepEqual(rows.map((r) => [r.title, r.kind, r.detail, r.progress]), [
    ['Give Liv her meds', 'chore', null, null],
    ['Pick colours: 3 sample pots', 'step', 'Paint the house', { step: 4, of: 9 }],
    ['Trash out to the street', 'reminder', 'By Alexa · Thu 4:26 PM', null],
    ['Call the vet to book a visit', 'todo', 'Bring Gilbert to the vet', null],
  ])
  // A next step the title already starts with is just the title.
  const anthony = panelTodos([], [todo('anthony', 'Call Anthony about house insurance alternatives', { nextStep: 'Call Anthony' })], now, { room: 1, quickRoom: 1 })
  assert.deepEqual(anthony.map((r) => [r.title, r.detail]), [['Call Anthony about house insurance alternatives', null]])
  // A plain to-do with nothing more to say keeps to one line.
  assert.deepEqual(rowDetail('todo', {}, now), { detail: null, progress: null })
})
