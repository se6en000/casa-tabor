import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTodoList } from '../supabase/functions/_shared/todos.mjs'

// P3.22 (board 09b): Next up is 3–5 things worth doing now; everything else folds by kind. The
// wall shows the next small thing, never the pile (the old prep lists: 3,414 items, 20 checked).
const today = '2026-09-28'
const r = (id, title, extra = {}) => ({ id, title, status: 'confirmed', has_due_date: false, start_time: '2026-09-28T04:00:00Z', created_at: '2026-09-20T12:00:00Z', ...extra })
const d = (shape, extra = {}) => ({ shape, minutes: null, cost_cents: null, next_step: null, needs: [], snoozed_until: null, snooze_count: 0, project_id: null, ...extra })
const reminders = [
  r('heater', 'Troubleshoot the water heater E05'),
  r('anthony', 'Call Anthony about house insurance alternatives'),
  r('gfi', 'Replace the outside GFI outlet', { has_due_date: true, start_time: '2026-09-19T21:00:00Z' }),
  r('windshield', 'Look up Tesla windshield rebate'),
  r('pool', 'Look for a cable to fix the pool'),
  r('tire', 'Replace tire sensor'),
  r('arlo', 'Install Arlo camera with solar'),
  r('trash', 'Trash out to the street'),
  r('forms', 'Liv athletics forms', { has_due_date: true, start_time: '2026-09-30T21:00:00Z' }),
  r('tryouts', 'Tryout info', { has_due_date: true, start_time: '2026-10-19T21:00:00Z' }),
  r('mystery', 'Thing'),
  r('quotes', 'Paint the house: get 3 quotes'),
]
const details = {
  heater: d('fix', { minutes: 20, next_step: 'check the gas valve, then reset it', needs: ['Hot water'] }),
  anthony: d('quick', { minutes: 10, next_step: 'call him back', needs: ['Call'] }),
  gfi: d('fix', { minutes: 45, cost_cents: 2500, next_step: 'buy a 20A outdoor GFI', needs: ['Safety'] }),
  windshield: d('quick', { minutes: 15, needs: ['Look-up'] }),
  pool: d('quick', { minutes: 15, snoozed_until: '2026-10-01', snooze_count: 1 }),
  tire: d('quick', { minutes: 30, cost_cents: 4000 }),
  arlo: d('fix', { minutes: 90, snooze_count: 3 }),
  trash: d('nudge'),
  forms: d('dated', { minutes: 20 }),
  tryouts: d('dated'),
  quotes: d('project', { minutes: 30, project_id: 'paint' }),
}
const projects = [{ id: 'paint', title: 'Paint the house', status: 'active', aim_date: null }]
const steps = [
  { project_id: 'paint', position: 1, title: 'Decide: DIY or hire', done_at: '2026-09-20T12:00:00Z' },
  { project_id: 'paint', position: 2, title: 'Walk the house', done_at: '2026-09-22T12:00:00Z' },
  { project_id: 'paint', position: 3, title: 'Get 3 quotes', done_at: null, reminder_event_id: 'quotes' },
  { project_id: 'paint', position: 4, title: 'Fix the wall cracks', done_at: null },
]
const list = buildTodoList({ reminders, details, projects, steps, today })
const ids = (items) => items.map((i) => i.id)

test('Next up: at most four, safety and real overdues first, always one quick win', () => {
  assert.ok(list.nextUp.length >= 3 && list.nextUp.length <= 4)
  assert.equal(list.nextUp[0].id, 'gfi', 'the safety fix, already past its date')
  assert.ok(list.nextUp.some((i) => i.shape === 'quick'))
})

test('never in Next up: nudges, snoozed things, dated things more than 3 days off, unsorted', () => {
  for (const id of ['trash', 'pool', 'tryouts', 'mystery']) assert.ok(!ids(list.nextUp).includes(id), id)
})

test('a small dated thing waits under Later until its day, then joins Next up (Jake, Oct 7: "till the day its actually due")', () => {
  const forms = list.groups.later.find((i) => i.id === 'forms')
  assert.equal(forms.due, '2026-09-30')
  assert.equal(forms.stage, 'quiet')
  assert.ok(!ids(list.nextUp).includes('forms'))
  const onTheDay = buildTodoList({ reminders, details, today: '2026-09-30' })
  assert.ok(ids(onTheDay.nextUp).includes('forms'))
  assert.equal(onTheDay.nextUp.find((i) => i.id === 'forms').stage, 'due')
})

test('a job that needs room shows a few days ahead; far-off ones fold under Later, soonest first', () => {
  const rs = [
    r('washer', 'Run the washing machine cleaning cycle', { has_due_date: true, start_time: '2026-10-12T21:00:00Z' }),
    r('gutter', 'Replace the gutter section', { has_due_date: true, start_time: '2026-09-30T21:00:00Z' }),
    r('hello', 'Re-up Hello Fresh dinners', { has_due_date: true, start_time: '2026-10-27T04:00:00Z' }),
  ]
  const ds = { washer: d('quick', { minutes: 10 }), gutter: d('fix', { minutes: 60, needs: ['Buy'] }), hello: d('quick', { minutes: 10 }) }
  const l = buildTodoList({ reminders: rs, details: ds, today: '2026-09-28' })
  assert.deepEqual(ids(l.nextUp), ['gutter'], 'a fix due in two days: there’s room to get the part')
  assert.deepEqual(ids(l.groups.later), ['washer', 'hello'])
  assert.deepEqual(ids(l.groups.quick), [])
})

test('the rest folds by kind; nothing appears twice; undated things are never "overdue"', () => {
  const all = [...list.nextUp, ...Object.values(list.groups).flat()]
  assert.equal(new Set(ids(all)).size, all.length)
  assert.deepEqual(ids(list.groups.nudge), ['trash'])
  assert.deepEqual(ids(list.groups.unsorted), ['mystery'])
  assert.ok(ids(list.groups.quick).includes('pool'))
  assert.equal(list.groups.quick.find((i) => i.id === 'pool').snoozedUntil, '2026-10-01')
  assert.equal(list.nextUp.concat(list.groups.quick).find((i) => i.id === 'anthony').overdue, false)
})

test('projects: progress and the current step', () => {
  const { detail, ...summary } = list.projects[0]
  assert.deepEqual(summary, { id: 'paint', title: 'Paint the house', done: 2, total: 4, next: 'Get 3 quotes', nextEventId: 'quotes', aimDate: null })
  // The shelf (canvas 10a) draws each card from the project and its steps, in order.
  assert.equal(detail.project.id, 'paint')
  assert.deepEqual(detail.steps.map((s) => s.title), ['Decide: DIY or hire', 'Walk the house', 'Get 3 quotes', 'Fix the wall cracks'])
})

test('the shelf: a project inside another rides on its parent’s card; a paused one still shows', () => {
  const l = buildTodoList({
    reminders: [], details: {}, today,
    projects: [{ id: 'paint', title: 'Paint the house', status: 'active' }, { id: 'stucco', title: 'Stucco cracks', status: 'active' }, { id: 'pool', title: 'Pool deck', status: 'paused' }],
    steps: [
      { project_id: 'paint', grp: 1, position: 1, title: 'Colours', done_at: null },
      { project_id: 'paint', grp: 1, position: 2, title: 'Stucco cracks', done_at: null, child_project_id: 'stucco' },
      { project_id: 'stucco', grp: 1, position: 1, title: 'Quote', done_at: '2026-09-24T12:00:00Z' },
      { project_id: 'stucco', grp: 2, position: 2, title: 'Patch', done_at: null },
    ],
  })
  assert.deepEqual(l.projects.map((p) => p.id), ['paint', 'pool'])
  assert.deepEqual(l.projects[0].detail.steps[1].child, { id: 'stucco', title: 'Stucco cracks', done: 1, total: 2, next: 'Patch', status: 'active' })
})

test('snoozed three times sinks below the rest', () => {
  const fixes = [...list.nextUp, ...list.groups.fix].filter((i) => i.shape === 'fix')
  assert.equal(fixes.at(-1).id, 'arlo')
})

// Step 2: Casa's suggestions (merge / looks done / to Shopping) wait for a yes, at the top.
test('suggestions are listed for a yes, with the other item named for a merge', () => {
  const withSuggestions = buildTodoList({
    reminders: [r('h1', 'Water heater E05'), r('h2', 'Water heater E05 again'), r('towels', 'Paper towels')],
    details: {
      h1: d('fix'),
      h2: d('fix', { suggestion: { kind: 'merge', with: 'h1', reason: 'Same thing' } }),
      towels: d('quick', { suggestion: { kind: 'shopping', reason: 'A grocery' } }),
    },
    today,
  })
  assert.deepEqual(withSuggestions.suggestions.map((s) => [s.id, s.kind, s.withTitle ?? null]).sort(), [['h2', 'merge', 'Water heater E05'], ['towels', 'shopping', null]])
  // A merge candidate or a grocery isn't offered as something to do.
  assert.ok(!withSuggestions.nextUp.some((i) => i.id === 'h2' || i.id === 'towels'))
})

// First live run: a vet visit and a shirt order, both dated a month ago, led Next up. A dated item
// belongs in Next up from its day until a week late (Oct 7); older ones wait in Dated.
test('a dated thing long past its day does not lead Next up', () => {
  const list2 = buildTodoList({
    reminders: [r('vet', 'Bring Gilbert to vet', { has_due_date: true, start_time: '2026-08-24T21:00:00Z' }), r('call', 'Call Anthony')],
    details: { vet: d('dated', { minutes: 15 }), call: d('quick', { minutes: 10 }) },
    today,
  })
  assert.deepEqual(list2.nextUp.map((i) => i.id), ['call'])
  assert.deepEqual(list2.groups.dated.map((i) => i.id), ['vet'])
})

// A dated step whose day has passed (P3.23; Jake: "should I be able to click on it … done? or just let
// the day pass and it's marked as done?"): never done by itself — asked once, the morning after.
test('a dated step whose last day has passed is asked about, not marked done', () => {
  const l = buildTodoList({
    reminders: [], details: {}, today: '2026-09-30',
    projects: [{ id: 'hc', title: 'Halloween costumes', status: 'active' }, { id: 'old', title: 'Old', status: 'dropped' }],
    steps: [
      { id: 'ask', project_id: 'hc', grp: 1, position: 1, title: 'Ask the kids what they want to be', cal_start: '2026-09-29', cal_end: null, done_at: null },
      { id: 'order', project_id: 'hc', grp: 2, position: 2, title: 'Order the costumes', cal_start: '2026-09-30', cal_end: null, done_at: null },
      { id: 'paint', project_id: 'hc', grp: 3, position: 3, title: 'Painter', cal_start: '2026-09-25', cal_end: '2026-10-02', done_at: null },
      { id: 'done', project_id: 'hc', grp: 4, position: 4, title: 'Done one', cal_start: '2026-09-20', cal_end: null, done_at: '2026-09-20T12:00:00Z' },
      { id: 'x', project_id: 'old', grp: 1, position: 1, title: 'Dropped', cal_start: '2026-09-20', cal_end: null, done_at: null },
    ],
  })
  assert.deepEqual(l.pastSteps, [{ id: 'ask', projectId: 'hc', project: 'Halloween costumes', title: 'Ask the kids what they want to be', date: '2026-09-29', start: '2026-09-29' }])
})

test('late leads Next up, a dated one too — the dedication page four days past its date (Oct 7)', () => {
  const rs = [r('page', 'Work on Olivia’s dedication page', { has_due_date: true, start_time: '2026-10-03T21:00:00Z' }), r('call', 'Call Anthony', {})]
  const l = buildTodoList({ reminders: rs, details: { page: d('dated', { minutes: 60 }), call: d('quick', { minutes: 15 }) }, today: '2026-10-07' })
  assert.deepEqual(ids(l.nextUp), ['page', 'call'])
  assert.equal(l.nextUp[0].stage, 'overdue')
})

test('snoozed and far off: under Later by its date, still marked snoozed (Hello Fresh, Oct 7)', () => {
  const rs = [r('hello', 'Re-up Hello Fresh dinners', { has_due_date: true, start_time: '2026-10-27T04:00:00Z' }), r('tesla', 'Look up the windshield', { has_due_date: true, start_time: '2026-09-17T21:00:00Z' })]
  const ds = { hello: d('quick', { minutes: 10, snoozed_until: '2026-10-21' }), tesla: d('quick', { minutes: 20, snoozed_until: '2026-10-13' }) }
  const l = buildTodoList({ reminders: rs, details: ds, today: '2026-10-07' })
  assert.deepEqual(ids(l.groups.later), ['hello'])
  assert.equal(l.groups.later[0].stage, 'snoozed')
  assert.deepEqual(ids(l.groups.quick), ['tesla'], 'late and snoozed: stays with its kind, marked snoozed')
})

// Jake, Oct 7 (a screenshot): "why are these steps for the project under next up? christmas stuff shouldnt be showing
// here till at least after halloween?"
test('project steps: on the card, not Next up — unless planned for a day that’s close; a far-off project waits off the shelf', () => {
  const rs = [
    r('lights-1', 'Christmas lights: Storage unit run', {}),
    r('paint-1', 'Paint the house: get quote to fix cracks', {}),
    r('roof-1', 'Replace roof decking: Assess the floorboards', {}),
  ]
  const ds = { 'lights-1': d('project', { minutes: 60, project_id: 'lights' }), 'paint-1': d('project', { minutes: 240, project_id: 'paint' }), 'roof-1': d('project', { minutes: 120, project_id: 'roof' }) }
  const projects = [{ id: 'lights', title: 'Christmas lights', status: 'active' }, { id: 'paint', title: 'Paint the house', status: 'active' }, { id: 'roof', title: 'Replace roof decking', status: 'active' }]
  const steps = [
    { id: 's1', project_id: 'lights', position: 1, grp: 1, title: 'Storage unit run', reminder_event_id: 'lights-1', cal_start: '2026-11-07', done_at: null },
    { id: 's2', project_id: 'paint', position: 1, grp: 1, title: 'get quote to fix cracks', reminder_event_id: 'paint-1', cal_start: null, done_at: null },
    { id: 's3', project_id: 'roof', position: 1, grp: 1, title: 'Assess the floorboards', reminder_event_id: 'roof-1', cal_start: '2026-10-08', done_at: null },
  ]
  const oct7 = buildTodoList({ reminders: rs, details: ds, projects, steps, today: '2026-10-07' })
  assert.deepEqual(ids(oct7.nextUp), ['roof-1'], 'only the step planned for tomorrow')
  assert.deepEqual(oct7.projects.map((p) => p.title), ['Paint the house', 'Replace roof decking'], 'Christmas lights waits off the shelf')
  assert.deepEqual(ids(oct7.groups.later), ['lights-1'])
  assert.equal(oct7.groups.later[0].due, '2026-11-07')
  const oct31 = buildTodoList({ reminders: rs, details: ds, projects, steps, today: '2026-10-31' })
  assert.ok(ids(oct31.nextUp).includes('lights-1'), 'a week before its day, after Halloween')
  assert.ok(oct31.projects.some((p) => p.title === 'Christmas lights'))
})

// Canvas 74C1 (Jake, Oct 8: "is this an event, a reminder, a get and prep and project? how did it get here"): each one
// says what it is and where it came from; a second copy of the same thing at the same time says so.
test('each to-do says what it is — a reminder or a project’s step (which, how far) — and how it got here', () => {
  const rs = [
    r('alexa', 'Look into box character project', { has_due_date: true, start_time: '2026-09-28T13:17:00Z', created_at: '2026-09-28T11:17:10Z', ai_origin_lane: 'wall-band-confirmation' }),
    r('copy', 'Look into box character project', { has_due_date: true, start_time: '2026-09-28T13:17:00Z', created_at: '2026-09-28T11:19:18Z' }),
    r('phone', 'Pick up dry cleaning', { created_at: '2026-09-27T20:00:00Z', ai_origin_lane: 'phone-add-sheet' }),
    r('mail', 'Send the field trip form', { description: 'Sign and return.\nTabor House · from Palm Beach Public’s email · Sep 26 · https://mail.google.com/mail/#all/abc' }),
    r('step', 'Install Tesla charger in garage: Order Tesla Wall Connector', { has_due_date: true, start_time: '2026-09-28T19:00:00Z', created_at: '2026-09-21T23:45:00Z' }),
    r('plain', 'Thing', { created_at: '2026-09-20T12:00:00Z' }),
  ]
  const ds = { alexa: d('quick'), copy: d('quick'), phone: d('quick'), mail: d('quick'), step: d('project', { project_id: 'tesla' }), plain: d('quick') }
  const projects = [{ id: 'tesla', title: 'Install Tesla charger in garage', status: 'active' }]
  const steps = [
    { id: 's1', project_id: 'tesla', grp: 0, position: 0, title: 'Get quotes', done_at: '2026-09-25T00:00:00Z', reminder_event_id: null },
    { id: 's2', project_id: 'tesla', grp: 0, position: 1, title: 'Order Tesla Wall Connector', done_at: null, reminder_event_id: 'step' },
    { id: 's3', project_id: 'tesla', grp: 0, position: 2, title: 'Book the electrician', done_at: null, reminder_event_id: null },
  ]
  const list = buildTodoList({ reminders: rs, details: ds, projects, steps, today })
  const all = Object.fromEntries([...list.nextUp, ...Object.values(list.groups).flat()].map((i) => [i.id, i]))
  assert.deepEqual(all.alexa.origin, { via: 'alexa', where: 'wall', text: null, at: '2026-09-28T11:17:10Z' })
  assert.equal(all.alexa.kind, 'reminder')
  assert.equal(all.alexa.copyOf, null)
  assert.equal(all.copy.copyOf, 'alexa') // the later one is the copy
  assert.deepEqual([all.phone.origin.via, all.phone.origin.where], ['hand', 'phone'])
  assert.deepEqual([all.mail.origin.via, all.mail.origin.text], ['email', 'From Palm Beach Public’s email · Sep 26'])
  assert.equal(all.step.kind, 'step')
  assert.deepEqual(all.step.project, { id: 'tesla', title: 'Install Tesla charger in garage', step: 2, of: 3 })
  assert.equal(all.step.origin.via, 'project')
  // Its name without the project's in front ("Order Tesla Wall Connector").
  assert.equal(all.step.stepTitle, 'Order Tesla Wall Connector')
  assert.deepEqual([all.plain.origin.via, all.plain.origin.at], [null, '2026-09-20T12:00:00Z'])
})
