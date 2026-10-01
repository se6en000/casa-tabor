import test from 'node:test'
import assert from 'node:assert/strict'
import { choreDetail, nextChoreDates, newChore } from '../src/wall/choreText.ts'

const chore = (extra) => ({ id: 'c', title: 'Change the cat litter', member_id: 'owen', for_member_id: null, days_of_week: [0], time_local: '10:00:00', minutes: 10, enabled: true, every_weeks: 4, starts_on: '2026-10-04', ...extra })

// Canvas 20a/20b: how a chore reads on a person's page, and the dates its schedule works out to.
test('a chore in one line: how often, which days, when, and the next time', () => {
  const today = new Date(2026, 9, 1)
  assert.equal(choreDetail(chore(), today), 'Every 4 weeks · Sun 10:00 AM · next Sun, Oct 4')
  assert.equal(choreDetail(chore({ days_of_week: [1, 4], time_local: '20:00:00', every_weeks: 1, starts_on: '2026-09-01' }), today), 'Mon & Thu 8:00 PM · next Thu, Oct 1')
  assert.equal(choreDetail(chore({ days_of_week: [1, 2, 3, 4, 5], time_local: '19:00:00', every_weeks: 1, starts_on: '2026-09-01' }), today), 'Weekdays 7:00 PM · next Thu, Oct 1')
  assert.equal(choreDetail(chore({ days_of_week: [0, 1, 2, 3, 4, 5, 6], time_local: '07:00:00', every_weeks: 1 }), new Date(2026, 9, 5)), 'Every day 7:00 AM · next Mon, Oct 5')
})

test('the next dates it works out to', () => {
  assert.deepEqual(nextChoreDates(chore(), new Date(2026, 9, 1), 4).map((d) => d.toDateString()), ['Sun Oct 04 2026', 'Sun Nov 01 2026', 'Sun Nov 29 2026', 'Sun Dec 27 2026'])
})

test('a new chore for someone starts this week, weekly, at 8 PM, theirs', () => {
  const c = newChore('owen', new Date(2026, 9, 1))
  assert.deepEqual([c.member_id, c.every_weeks, c.time_local, c.starts_on, c.title], ['owen', 1, '20:00:00', '2026-10-01', ''])
})
