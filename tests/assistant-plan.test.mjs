import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, buildFullAiSystem, fullAiCard, fullAiTools } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Plan it with Casa (P3.25 phase 3; canvas 12b/12c, approved by Jake 2026-09-29): once a direction is
// settled, the planning model sets the whole plan; the server checks it into a draft card (the same
// card mechanism as every other change: revised in place, nothing saved until he agrees).

const utcOffset = '-04:00'
const now = new Date('2026-09-29T19:48:00-04:00')
const costumes = {
  id: 'p-costumes', title: 'Halloween costumes', aim_date: '2026-10-31', done: 0, total: 2,
  steps: [{ id: 's-ask', title: 'Ask the kids what they want to be', grp: 1, done: false }, { id: 's-buy', title: 'Buy what they need', grp: 2, done: false }],
}
const events = [{ id: 'e-halloween', title: 'Halloween', start_time: '2026-10-31T04:00:00Z', end_time: '2026-11-01T03:59:00Z', all_day: true, event_type: 'event', people: [], drivers: [], place: null, address: null }]
const ctx = { events, utcOffset, now, projects: [costumes] }
const call = (args) => fullAiCard({ name: 'set_plan', args }, ctx)

const jellyfish = {
  title: 'Emme — light-up jellyfish',
  items: [
    { kind: 'project', title: 'Emme — light-up jellyfish', part_of_project_id: 'p-costumes', why: 'Inside the costumes you already have.',
      steps: [{ title: 'Buy the parts', minutes: 30, cost: 45 }, { title: 'Build night', minutes: 120, who: 'Jake + Emme', date: '2026-10-17' }, { title: 'Try it on after dark', date: '2026-10-25' }] },
    { kind: 'tick_step', project_id: 'p-costumes', step_id: 's-ask', why: 'Emme picked the jellyfish.' },
    { kind: 'shopping', name: 'Clear dome umbrella' },
    { kind: 'shopping', name: 'Battery fairy lights, 2 strands' },
    { kind: 'event', title: 'Trick-or-treat', start: '2026-10-31T18:00', end: '2026-10-31T20:00' },
    { kind: 'pack', label: 'Spare AA batteries', for_event: 'Trick-or-treat' },
    { kind: 'pack', label: 'Water', for_event: 'e-halloween' },
    { kind: 'todo', title: 'Charge the fairy lights', due: '2026-10-30' },
  ],
}

test('only the planning model can set a plan', () => {
  assert.ok(fullAiTools({ planning: true }).some((t) => t.name === 'set_plan'))
  assert.equal(fullAiTools({ planning: false }).some((t) => t.name === 'set_plan'), false)
  assert.equal(FULL_AI_TOOLS.some((t) => t.name === 'set_plan'), false)
  const tool = fullAiTools({ planning: true }).find((t) => t.name === 'set_plan')
  assert.match(tool.description, /whole plan/i)
  // Only what matters — not the fewest (Jake, 2026-09-30: a photo can hold many things).
  assert.match(tool.description, /Only what matters, each with a short why/)
})

test('a plan becomes one draft card: every item checked, with an id for its tick on the card', () => {
  const card = call(jellyfish)
  assert.equal(card.tool, 'apply_plan')
  assert.equal(card.args.id, 'plan', 'one plan per conversation: a change revises the same card')
  assert.equal(card.args.title, 'Emme — light-up jellyfish')
  const items = card.args.items
  assert.deepEqual(items.map((i) => i.id), ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'])
  const project = items[0]
  assert.equal(project.part_of_project_id, 'p-costumes')
  assert.equal(project.part_of, 'Halloween costumes')
  assert.deepEqual(project.steps[0], { title: 'Buy the parts', minutes: 30, cost_cents: 4500 })
  assert.deepEqual(project.steps[1], { title: 'Build night', minutes: 120, who: 'Jake + Emme', cal_start: '2026-10-17' })
  assert.equal(items[1].title, 'Ask the kids what they want to be', 'a tick names the saved step')
  assert.equal(items[1].why, 'Emme picked the jellyfish.')
  assert.equal(items[4].start, '2026-10-31T18:00:00-04:00')
  assert.equal(items[4].end, '2026-10-31T20:00:00-04:00')
  assert.equal(items[5].event_ref, 'i5', 'packed for an event in the same plan')
  assert.equal(items[6].event_id, 'e-halloween', 'or for one already on the calendar')
  assert.equal(items[6].event_title, 'Halloween')
  assert.deepEqual(items[7], { id: 'i8', kind: 'todo', title: 'Charge the fairy lights', due: '2026-10-30' })
})

test('what can’t be saved is left out, never guessed', () => {
  const card = call({ title: 'Mixed', items: [
    { kind: 'tick_step', project_id: 'p-costumes', step_id: 's-nope' },
    { kind: 'project', title: 'Inside nothing', part_of_project_id: 'p-nope', steps: [{ title: 'One' }] },
    { kind: 'pack', label: 'Lost', for_event: 'no such event' },
    { kind: 'event', title: 'No time', start: 'soon' },
    { kind: 'shopping', name: '  ' },
    { kind: 'dance', title: '?' },
  ] })
  assert.deepEqual(card.args.items.map((i) => i.kind), ['project'])
  assert.equal(card.args.items[0].part_of_project_id, undefined)
  assert.equal(call({ title: 'Nothing', items: [{ kind: 'shopping', name: '' }] }).error, 'There’s nothing in that plan I can save yet.')
})

test('the draft on screen is described back, so "make it Friday" changes it', () => {
  const card = call(jellyfish)
  const system = buildFullAiSystem({ family: [], events, groceries: [], pending: card, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', planning: true })
  const onScreen = system.split('\n\n').find((s) => s.startsWith('ON SCREEN'))
  assert.match(onScreen, /THE PLAN, NOT SAVED YET: Emme — light-up jellyfish/)
  assert.match(onScreen, /Build night · Jake \+ Emme · 2 h · Sat Oct 17/)
  assert.match(onScreen, /tick off “Ask the kids what they want to be”/)
  assert.match(onScreen, /pack “Spare AA batteries” for Trick-or-treat/)
  assert.match(onScreen, /call set_plan again with the whole plan/)
})

test('the planning model sees the ids it needs: each project and each step', () => {
  const system = buildFullAiSystem({ family: [], events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', planning: true, projects: [costumes] })
  const section = system.split('\n\n').find((s) => s.startsWith('PROJECTS'))
  assert.match(section, /- \[p-costumes\] Halloween costumes/)
  assert.match(section, /NOW: \[s-ask\] Ask the kids what they want to be/)
  const [intro] = system.split('\n\n')
  assert.match(intro, /set_plan/)
})

test('the assistant hands the plan over with its words; the card executor saves and undoes it, and tells Google', async () => {
  const fs = await import('node:fs')
  const ai = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(ai, /\{ events, utcOffset, now, groceries, family, todos, projects, contacts \}\)/, 'the checker knows the projects and their steps (and the contacts, for an address)')
  assert.match(ai, /card\.tool === 'apply_plan' \? \(said \|\|/)
  const exec = fs.readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  const part = exec.slice(exec.indexOf("if (tool === 'apply_plan' || tool === 'undo_plan')"), exec.indexOf("if (tool === 'add_gift_idea')"))
  assert.match(part, /rpc\('casa_plan_apply'/)
  assert.match(part, /p_skip: Array\.isArray\(args\.skip\)/)
  assert.match(part, /rpc\('casa_plan_undo'/)
  for (const f of ['create-google-event', 'delete-google-event', 'push-to-google', 'enqueue_google_sync_job']) assert.ok(part.includes(f), f)
})

// Live check, 2026-09-29: with the plan on screen, "Make the build night Friday the 16th instead." was
// taken by the quick turn reader as an edit to an ordinary draft, and failed. While a plan is on screen,
// every turn but a yes or a never-mind goes straight to the planning model.
test('with a plan on screen, a follow-up goes straight to the planning model', async () => {
  const fs = await import('node:fs')
  const ai = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(ai, /handBack = false, startPlanning = false\): Promise</)
  assert.match(ai, /let planning = startPlanning/)
  assert.match(ai, /let system = systemFor\(startPlanning\)/)
  const pipeline = ai.slice(ai.indexOf('const runPipeline = async'))
  const early = pipeline.slice(0, pipeline.indexOf('if (turnContext?.card)'))
  assert.match(early, /\(planningConversation \|\| stepCard\) && turnResolution\?\.act !== 'confirm_draft' && !turnContext\?\.cancelledDraft/)
  assert.match(early, /runFullAi\(buildDisplayText, false, true\)/)
})

// Live check, 2026-09-29: after a planning answer, "What do I need, and when should we build it?" was
// answered by the fast model (no plan), and "make the build night Friday" became a lone event. Once a
// conversation has gone to the planning model, it stays there.
test('a conversation that went to the planning model stays there', async () => {
  const fs = await import('node:fs')
  const ai = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = ai.slice(ai.indexOf('const runFullAi = async'), ai.indexOf('const runPipeline = async'))
  assert.match(run, /\.\.\.\(planning \? \{ planning: true \} : \{\}\)/, 'planning answers are marked')
  assert.match(ai, /\(context as \{ planning\?: boolean \} \| undefined\)\?\.planning === true/)
  const hook = fs.readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
  assert.match(hook, /data\?\.planning === true \? \{ planning: true \} : \{\}/, 'the app remembers it on the message')
  assert.match(hook, /planning: messages\.some\(\(message\) => message\.role === 'assistant' && message\.planning\) \|\| undefined/, 'and sends it with the next turn')
})

// Jake's first real plan, 2026-09-29: one Sunday build session came out as four dated steps (four
// all-day calendar entries) plus a timed event, all on Oct 18. One session, one calendar entry.
test('one session on the calendar once: a timed event covers its day; several steps on one day, only the first is dated', () => {
  const card = call({ title: 'Jellyfish', items: [
    { kind: 'project', title: 'Make the jellyfish', steps: [
      { title: 'Gather supplies', date: '2026-10-11' },
      { title: 'Decorate the dome', date: '2026-10-18' },
      { title: 'Attach the tentacles', date: '2026-10-18' },
      { title: 'Fitting', date: '2026-10-25' },
      { title: 'Light test', date: '2026-10-25' },
    ] },
    { kind: 'event', title: 'Build the jellyfish', start: '2026-10-18T14:00', end: '2026-10-18T16:00' },
  ] })
  const steps = card.args.items[0].steps
  assert.deepEqual(steps.map((s) => s.cal_start ?? null), ['2026-10-11', null, null, '2026-10-25', null])
})

test('a plan event Google refused is queued for a retry, not dropped', async () => {
  const fs = await import('node:fs')
  const exec = fs.readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  const part = exec.slice(exec.indexOf("if (tool === 'apply_plan' || tool === 'undo_plan')"), exec.indexOf("if (tool === 'add_gift_idea')"))
  assert.match(part, /invoke\(c\.op === 'created' \? 'create-google-event' : 'push-to-google'/)
  assert.doesNotMatch(part, /'create-google-event', \{ body: \{ event_id: c\.event_id \} \}\)\.catch\(\(\) => null\)/)
})

// Jake, 2026-09-29, Owen's ghost costume: mid-plan, "add a white t-shirt and shorts to the shopping
// list" became separate cards, and he had to say "we should have that to the plan along with everything
// else". While planning, the model only looks things up and changes the plan: one Agree for all of it.
test('the planning model can look things up and change the plan — nothing else', () => {
  const names = fullAiTools({ planning: true }).map((t) => t.name)
  assert.ok(names.includes('set_plan'))
  assert.ok(names.includes('search_web') && names.includes('find_events') && names.includes('get_coming_up'))
  for (const write of ['add_grocery_items', 'create_event', 'add_todo', 'plan_project', 'update_event']) assert.equal(names.includes(write), false, write)
  const tool = fullAiTools({ planning: true }).find((t) => t.name === 'set_plan')
  assert.match(tool.description, /keep everything already in it unless he asks/i, '"Where did the plan steps go?"')
})

// Phase 4 (P3.25): change a saved project by talking, or replace it. Liv's scuba diver, inside her
// costumes project; the ids are checked against what's really there.
const livScuba = {
  id: 'p-scuba', title: 'Liv — scuba diver', parent: 'Halloween costumes', parent_id: 'p-costumes', done: 1, total: 3,
  steps: [{ id: 's-mask', title: 'Buy the mask', grp: 1, done: true }, { id: 's-tank', title: 'Build the tank', grp: 2, done: false, cal_start: '2026-10-17' }, { id: 's-fit', title: 'Fitting', grp: 3, done: false }],
}
const ctx4 = { events, utcOffset, now, projects: [costumes, livScuba] }
const call4 = (args) => fullAiCard({ name: 'set_plan', args }, ctx4)

test('a saved step changed, added or removed — checked, with the words the card shows', () => {
  const card = call4({ title: 'Liv’s costume', items: [
    { kind: 'edit_step', project_id: 'p-scuba', step_id: 's-tank', date: '2026-10-18', who: 'Kelly' },
    { kind: 'add_step', project_id: 'p-scuba', title: 'Paint the tank', after_step_id: 's-tank', minutes: 45, cost: 12 },
    { kind: 'remove_step', project_id: 'p-scuba', step_id: 's-fit' },
    { kind: 'edit_step', project_id: 'p-scuba', step_id: 's-mask', who: 'Kelly' },
    { kind: 'edit_step', project_id: 'p-scuba', step_id: 's-nope', who: 'Kelly' },
    { kind: 'remove_step', project_id: 'p-costumes', step_id: 's-fit' },
  ] })
  assert.deepEqual(card.args.items, [
    { id: 'i1', kind: 'edit_step', project_id: 'p-scuba', step_id: 's-tank', project: 'Liv — scuba diver', title: 'Build the tank', changes: { cal_start: '2026-10-18', who: 'Kelly' } },
    { id: 'i2', kind: 'add_step', project_id: 'p-scuba', project: 'Liv — scuba diver', title: 'Paint the tank', after_step_id: 's-tank', after: 'Build the tank', changes: { minutes: 45, cost_cents: 1200 } },
    { id: 'i3', kind: 'remove_step', project_id: 'p-scuba', step_id: 's-fit', project: 'Liv — scuba diver', title: 'Fitting' },
    { id: 'i4', kind: 'edit_step', project_id: 'p-scuba', step_id: 's-mask', project: 'Liv — scuba diver', title: 'Buy the mask', changes: { who: 'Kelly' } },
  ], 'a step that isn’t there, or isn’t in that project, is left out')
})

test('a project replaced: closed with its reason, the new one in the same place', () => {
  const card = call4({ title: 'Liv is Chucky now', items: [
    { kind: 'close_project', project_id: 'p-scuba', reason: 'Changed to Chucky' },
    { kind: 'project', title: 'Liv — Chucky', part_of_project_id: 'p-costumes', steps: [{ title: 'Buy overalls' }] },
  ] })
  assert.deepEqual(card.args.items[0], { id: 'i1', kind: 'close_project', project_id: 'p-scuba', title: 'Liv — scuba diver', reason: 'Changed to Chucky', open_steps: 2 })
  assert.equal(card.args.items[1].part_of, 'Halloween costumes')
  assert.equal(call4({ title: 'x', items: [{ kind: 'close_project', project_id: 'p-nope' }] }).error, 'There’s nothing in that plan I can save yet.')
})

test('the planning model is told to change a saved project, never rebuild it; to replace, close it and add the new one in its place', () => {
  const tool = fullAiTools({ planning: true }).find((t) => t.name === 'set_plan')
  for (const kind of ['edit_step', 'add_step', 'remove_step', 'close_project']) assert.ok(tool.parameters.properties.items.items.properties.kind.enum.includes(kind), kind)
  assert.match(tool.description, /never rebuild it/i)
  assert.match(tool.description, /close_project .* reason/i)
  const system = buildFullAiSystem({ family: [], events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', projects: [costumes, livScuba] })
  assert.match(system, /- \[p-scuba\] Liv — scuba diver \(inside Halloween costumes\)/, 'a project inside is listed with its own steps and id')
  assert.doesNotMatch(system, /can't be changed or deleted by voice yet/)
  const think = fullAiTools({ planning: false }).find((t) => t.name === 'think_it_through')
  assert.match(think.description, /a change to one of his saved projects/i)
})

// Live check, 2026-09-29: "Move Emme's jellyfish build night to Sunday the 18th, and Kelly will do it"
// became a plain event change on the step's all-day calendar entry. A project step's calendar entry is
// changed through its project: the planning model, as a change to the step.
test('a change to a project step’s calendar entry goes to the planning model as a change to the step', async () => {
  const fs = await import('node:fs')
  const ai = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const pipeline = ai.slice(ai.indexOf('const runPipeline = async'))
  const early = pipeline.slice(0, pipeline.indexOf('if (turnContext?.card) {'))
  assert.match(early, /from\('todo_steps'\)\.select\('id'\)\.eq\('cal_event_id', stepEventId\)/)
  assert.match(early, /\(planningConversation \|\| stepCard\) && turnResolution\?\.act !== 'confirm_draft'/)
})

// Step 4 (P3.25): "move the painter after the stucco" — a saved project's step, moved after another of its
// steps (or first); never a step that isn't there, and never after itself.
test('a plan can move a saved step after another one, or to the start', () => {
  const plan = call4({ title: 'Scuba order', items: [
    { kind: 'move_step', project_id: 'p-scuba', step_id: 's-fit', after_step_id: 's-mask' },
    { kind: 'move_step', project_id: 'p-scuba', step_id: 's-tank' },
    { kind: 'move_step', project_id: 'p-scuba', step_id: 's-fit', after_step_id: 's-fit' },
    { kind: 'move_step', project_id: 'p-scuba', step_id: 'nope', after_step_id: 's-mask' },
    { kind: 'move_step', project_id: 'p-scuba', step_id: 's-fit', after_step_id: 'elsewhere' },
  ] })
  assert.deepEqual(plan.args.items, [
    { id: 'i1', kind: 'move_step', project_id: 'p-scuba', step_id: 's-fit', project: 'Liv — scuba diver', title: 'Fitting', after_step_id: 's-mask', after: 'Buy the mask' },
    { id: 'i2', kind: 'move_step', project_id: 'p-scuba', step_id: 's-tank', project: 'Liv — scuba diver', title: 'Build the tank' },
  ])
  const tool = fullAiTools({ planning: true }).find((t) => t.name === 'set_plan')
  assert.ok(tool.parameters.properties.items.items.properties.kind.enum.includes('move_step'))
})

test('the planning model is told how to reorder a saved project', () => {
  const system = buildFullAiSystem({ family: [], events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', planning: true, projects: [costumes] })
  assert.match(system, /is move_step/)
})
