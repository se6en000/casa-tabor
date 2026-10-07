import test from 'node:test'
import assert from 'node:assert/strict'
import { leadDays, overdueToRaise, todoStage } from '../supabase/functions/_shared/todo-stage.mjs'
import { buildFullAiSystem, todoForCasa } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Jake, Oct 7: "prioritized as it comes up to its due day … the proactive system to be aware of what is coming up due
// … stuff that is overdue, we should always be talking about, if I snooze it I want it actually snoozed from all
// conversations till its due again" → "Alexa raises one overdue item a day … offer a way to help".
const today = '2026-10-07'

test('lead time by what it takes: a small reminder a day, a fix or a part three, a pro or a booking a week', () => {
  assert.equal(leadDays({ minutes: 10, shape: 'quick' }), 1)
  assert.equal(leadDays({ minutes: 60, shape: 'quick' }), 3)
  assert.equal(leadDays({ shape: 'fix' }), 3)
  assert.equal(leadDays({ needs: ['Buy'] }), 3)
  assert.equal(leadDays({ needs: ['Call', 'Needs a pro'] }), 7)
})

test('stages: quiet, heads-up, due, late — and snoozed beats them all until it ends', () => {
  const washer = { due: '2026-10-12', minutes: 10, shape: 'quick' }
  assert.equal(todoStage(washer, today).stage, 'quiet')
  assert.equal(todoStage(washer, '2026-10-11').stage, 'heads_up')
  assert.equal(todoStage(washer, '2026-10-12').stage, 'due')
  assert.equal(todoStage(washer, '2026-10-13').stage, 'overdue')
  assert.equal(todoStage({ ...washer, snoozedUntil: '2026-10-20' }, '2026-10-13').stage, 'snoozed')
  assert.equal(todoStage({ ...washer, snoozedUntil: '2026-10-20' }, '2026-10-20').stage, 'overdue', 'back on its end day, still late')
  assert.equal(todoStage({ due: null }, today).stage, 'undated')
})

test('one late to-do a day: safety and the house first, then the longest late; never a snoozed one; none once raised', () => {
  const items = [
    { id: 'vet', due: '2026-08-24', needs: ['Call'] },
    { id: 'gfi', due: '2026-09-30', needs: ['Safety', 'Buy'] },
    { id: 'tesla', due: '2026-09-18', snoozedUntil: '2026-10-13', needs: [] },
    { id: 'hello', due: '2026-10-27', needs: [] },
  ]
  assert.equal(overdueToRaise(items, today).id, 'gfi')
  assert.equal(overdueToRaise(items.filter((i) => i.id !== 'gfi'), today).id, 'vet')
  // Late this week before long gone (Oct 7 live: the 21-days-late field trip slip was raised over the dedication page).
  const live = [{ id: 'slip', due: '2026-09-16', needs: [] }, { id: 'page', due: '2026-10-03', needs: [] }]
  assert.equal(overdueToRaise(live, today).id, 'page')
  assert.equal(overdueToRaise(items, today, { date: today, id: 'gfi' }), null)
  assert.equal(overdueToRaise(items, today, { date: '2026-10-06', id: 'gfi' }).id, 'gfi')
})

test('Alexa: snoozed and far-off to-dos are named so she leaves them be; the late one comes with an offer', () => {
  const now = new Date('2026-10-07T15:00:00Z')
  const row = (id, title, start, has = true) => ({ id, title, has_due_date: has, start_time: start, all_day: true })
  const todos = [
    todoForCasa(row('gfi', 'Replace the outside GFI outlet', '2026-09-30T21:00:00Z'), now, 'America/New_York', { shape: 'fix', minutes: 30, needs: ['Safety', 'Buy'], next_step: 'Turn off the power' }),
    todoForCasa(row('tesla', 'Look up replacing my Tesla windshield', '2026-09-18T21:00:00Z'), now, 'America/New_York', { shape: 'quick', snoozed_until: '2026-10-13' }),
    todoForCasa(row('hello', 'Re-up Hello Fresh dinners', '2026-10-27T04:00:00Z'), now, 'America/New_York', { shape: 'quick', minutes: 10 }),
    todoForCasa(row('washer', 'Clean the washing machine', '2026-10-08T21:00:00Z'), now, 'America/New_York', { shape: 'quick', minutes: 10 }),
  ]
  assert.deepEqual(todos.map((t) => t.stage), ['overdue', 'snoozed', 'quiet', 'heads_up'])
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now, homeCity: 'West Palm Beach', todos, raise: todos[0] })
  assert.match(system, /LATE \(bring up only the one[^\n]*\n- \[gfi\] Replace the outside GFI outlet .*needs: Safety, Buy · next: Turn off the power/)
  assert.match(system, /COMING UP \(a heads-up is fine once[^\n]*\n- \[washer\] Clean the washing machine/)
  assert.match(system, /LATER \(further off — don't bring these up[^\n]*\n- \[hello\]/)
  assert.match(system, /SNOOZED \(he put these off — never bring them up[^\n]*\n- \[tesla\] Look up replacing my Tesla windshield \(snoozed until Tue Oct 13\)/)
  assert.match(system, /LATE TO-DO TO RAISE TODAY: \[gfi\] Replace the outside GFI outlet — 7 days late/)
  assert.match(system, /ONE concrete offer[^\n]*"Want me to find the exact part and what it costs, and where to get it nearby\?"/)
  assert.match(system, /Still want this\? Do it this week, snooze it, or drop it/)
  assert.doesNotMatch(buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now, homeCity: 'West Palm Beach', todos }), /^LATE TO-DO TO RAISE TODAY:/m)
})

import { offerFor } from '../supabase/functions/_shared/todo-stage.mjs'
test('the offer fits the job: local handymen or a post, a part, a look-up, a call, a first step, or time — no pros for a big project', () => {
  assert.match(offerFor({ needs: ['Call', 'Needs a pro'] }), /three well-reviewed local handymen near home.*short TaskRabbit post/)
  assert.match(offerFor({ needs: ['Safety', 'Buy'] }), /exact part/)
  assert.match(offerFor({ needs: ['Look-up'] }), /look it up/)
  assert.match(offerFor({ shape: 'fix' }), /local handymen/)
  assert.match(offerFor({ needs: ['Call'] }), /10-minute call/)
  assert.match(offerFor({ nextStep: 'Pick the photos', minutes: 45 }), /help with its first step right here \(Pick the photos\), or put 45 minutes/)
  assert.match(offerFor({ shape: 'dated', minutes: 60 }), /60 minutes for it on the calendar this week/)
  // Jake, Oct 7: "for a big project I wont use alexa".
  assert.match(offerFor({ shape: 'project', needs: ['Needs a pro'] }), /minutes for it on the calendar/)
  assert.doesNotMatch(offerFor({ minutes: 480, needs: ['Needs a pro'] }), /handymen|post/)
})
