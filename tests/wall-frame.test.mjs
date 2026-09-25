import test from 'node:test'
import assert from 'node:assert/strict'
import { computeStageFit, STAGE_WIDTH, STAGE_HEIGHT } from '../src/wall/stage.ts'
import { msUntilNextMinute, formatWallClock, formatWallDate } from '../src/wall/clock.ts'
import { xForTime, isOnTimeline, hourMarks, TIMELINE_WIDTH } from '../src/wall/timeline.ts'
import { selectLaneMembers, pigmentClassFor } from '../src/wall/lanes.ts'

test('stage fills a 1920x1080 panel exactly', () => {
  assert.deepEqual(computeStageFit(1920, 1080), { scale: 1, offsetX: 0, offsetY: 0 })
})

test('stage scales uniformly and letterboxes on other screens', () => {
  const small = computeStageFit(1280, 720)
  assert.equal(small.scale, 1280 / 1920)
  assert.equal(small.offsetX, 0)
  assert.equal(small.offsetY, 0)

  const tall = computeStageFit(1920, 1200)
  assert.equal(tall.scale, 1)
  assert.equal(tall.offsetX, 0)
  assert.equal(tall.offsetY, 60)

  const wide = computeStageFit(2560, 1080)
  assert.equal(wide.scale, 1)
  assert.equal(wide.offsetX, 320)
})

test('stage never collapses on a zero or missing viewport', () => {
  assert.deepEqual(computeStageFit(0, 0), { scale: 1, offsetX: 0, offsetY: 0 })
  assert.equal(STAGE_WIDTH, 1920)
  assert.equal(STAGE_HEIGHT, 1080)
})

test('clock ticks exactly on the next minute boundary', () => {
  assert.equal(msUntilNextMinute(new Date(2026, 8, 25, 10, 8, 0, 0)), 60_000)
  assert.equal(msUntilNextMinute(new Date(2026, 8, 25, 10, 8, 59, 500)), 500)
  assert.equal(msUntilNextMinute(new Date(2026, 8, 25, 10, 8, 30, 0)), 30_000)
})

test('clock and date read the way the design shows them', () => {
  const at = new Date('2026-09-25T14:08:00Z')
  assert.deepEqual(formatWallClock(at, 'America/New_York'), { time: '10:08', meridiem: 'AM' })
  assert.deepEqual(formatWallClock(new Date('2026-09-25T17:40:00Z'), 'America/New_York'), { time: '1:40', meridiem: 'PM' })
  assert.equal(formatWallDate(at, 'America/New_York'), 'Friday, September 25')
})

test('timeline maps 7 AM to 9 PM across the lane width', () => {
  assert.equal(xForTime(new Date(2026, 8, 25, 7, 0)), 0)
  assert.equal(xForTime(new Date(2026, 8, 25, 21, 0)), TIMELINE_WIDTH)
  assert.equal(xForTime(new Date(2026, 8, 25, 14, 0)), TIMELINE_WIDTH / 2)
  // design mock: now line at 10:08 sits ~338px in
  assert.ok(Math.abs(xForTime(new Date(2026, 8, 25, 10, 8)) - 338.4) < 0.5)
})

test('timeline clamps and reports times outside the visible day', () => {
  assert.equal(xForTime(new Date(2026, 8, 25, 5, 30)), 0)
  assert.equal(xForTime(new Date(2026, 8, 25, 23, 0)), TIMELINE_WIDTH)
  assert.equal(isOnTimeline(new Date(2026, 8, 25, 6, 59)), false)
  assert.equal(isOnTimeline(new Date(2026, 8, 25, 12, 0)), true)
  assert.equal(isOnTimeline(new Date(2026, 8, 25, 21, 1)), false)
})

test('hour marks label the ends and noon, numbers in between', () => {
  const marks = hourMarks()
  assert.equal(marks.length, 15)
  assert.equal(marks[0].label, '7 AM')
  assert.equal(marks[5].label, '12 PM')
  assert.equal(marks[6].label, '1')
  assert.equal(marks[14].label, '9 PM')
  assert.equal(marks[14].x, TIMELINE_WIDTH)
})

test('lanes show the people the family chose for the home screen, in their order', () => {
  const family = [
    { id: 'o', name: 'Owen', sort_order: 5, show_on_home_sidebar: true },
    { id: 'tf', name: 'Tabor Family', sort_order: 5, show_on_home_sidebar: false },
    { id: 'j', name: 'Jake', sort_order: 1, show_on_home_sidebar: true },
    { id: 'm', name: 'Milo', sort_order: 9, show_on_home_sidebar: false },
    { id: 'g', name: 'Giselle', sort_order: 7, show_on_home_sidebar: true },
    { id: 'k', name: 'Kelly', sort_order: 2, show_on_home_sidebar: true },
    { id: 'e', name: 'Emme', sort_order: 4, show_on_home_sidebar: true },
    { id: 'l', name: 'Liv', sort_order: 3, show_on_home_sidebar: true },
  ]
  assert.deepEqual(selectLaneMembers(family).map((m) => m.name), ['Jake', 'Kelly', 'Liv', 'Emme', 'Owen', 'Giselle'])
})

test('a sitter who is off the home screen gets a lane only on days they have something', () => {
  const family = [
    { id: 'j', name: 'Jake', sort_order: 1, show_on_home_sidebar: true, role: 'parent', can_drive: true },
    { id: 'g', name: 'Giselle', sort_order: 7, show_on_home_sidebar: true, role: 'caregiver', can_drive: true },
    { id: 's', name: 'Sam', sort_order: 8, show_on_home_sidebar: false, role: 'caregiver', can_drive: true },
    { id: 'm', name: 'Milo', sort_order: 9, show_on_home_sidebar: false, role: 'child', can_drive: false },
    { id: 'tf', name: 'Tabor Family', sort_order: 5, show_on_home_sidebar: false, role: 'child', can_drive: false },
  ]
  const names = (active) => selectLaneMembers(family, active).map((m) => m.name)
  assert.deepEqual(names(new Set()), ['Jake', 'Giselle'])
  assert.deepEqual(names(new Set(['s'])), ['Jake', 'Giselle', 'Sam'])
  // hidden non-drivers (a household placeholder, a hidden child) never pop in
  assert.deepEqual(names(new Set(['m', 'tf'])), ['Jake', 'Giselle'])
})

test('each lane gets a distinct pigment and the palette wraps', () => {
  const firstSix = [0, 1, 2, 3, 4, 5].map(pigmentClassFor)
  assert.equal(new Set(firstSix).size, 6)
  assert.equal(pigmentClassFor(0), 'bg-wall-pigment-1')
  assert.equal(pigmentClassFor(6), pigmentClassFor(0))
})
