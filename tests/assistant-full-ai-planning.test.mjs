import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, buildFullAiSystem, comingUpForModel, fullAiStatus, fullAiTools } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// P3.25 phase 1 (Plan it with Casa): the assistant can talk. Jake, 2026-09-29 9:14 AM: "Right now
// she feels very strict and just like do you wanna add something to the calendar or add something to
// the to do list? But there's no real thinking or conversation behind the ideas, whether it's a good
// idea or a bad idea." And on the design doc: web lookups for prices, Reddit and what's local; extra
// time is fine when planning "as long as it does a good job".

const now = new Date('2026-09-29T10:00:00-04:00')
const fullAiToolsForTest = () => fullAiTools({ planning: false })
const base = { family: [{ name: 'Jake', role: 'parent', can_drive: true }], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now, homeCity: 'West Palm Beach' }

test('the planning model is told to think with him: ideas, an honest opinion, push back, and no steering to an add', () => {
  const [intro] = buildFullAiSystem({ ...base, planning: true }).split('\n\n')
  assert.match(intro, /talk (it|something) through/i)
  assert.match(intro, /concrete ideas/i)
  assert.match(intro, /honest (opinion|take)/i)
  assert.match(intro, /push back/i)
  assert.match(intro, /don.t steer/i)
  assert.match(intro, /search_web/)
  assert.match(intro, /Reddit/)
  assert.match(intro, /West Palm Beach/)
})

test('every project is there in full: its steps in order, what is done and Now, who, time, cost and dates', () => {
  const projects = [{
    id: 'p1', title: 'Paint the house', aim_date: '2026-11-15', done: 1, total: 4, next: 'Fix the cracks',
    steps: [
      { title: 'Get three quotes', grp: 1, done: true },
      { title: 'Fix the cracks', grp: 2, child: { title: 'Fix the Cracks', done: 1, total: 3 } },
      { title: 'Pick the colors', grp: 2, who: 'Kelly', minutes: 90 },
      { title: 'Pressure wash', grp: 3, cost_cents: 15000, cal_start: '2026-10-10', cal_end: '2026-10-10' },
    ],
  }]
  const system = buildFullAiSystem({ ...base, projects })
  const section = system.split('\n\n').find((s) => s.startsWith('PROJECTS'))
  assert.ok(section)
  assert.match(section, /Paint the house · aim Sun Nov 15 · 1 of 4 steps done/)
  assert.match(section, /done: Get three quotes/)
  assert.match(section, /NOW: Fix the cracks \(a project inside: Fix the Cracks, 1 of 3 done\)/)
  assert.match(section, /NOW: Pick the colors · Kelly · 1 h 30 min/, 'side by side with the other Now step')
  assert.match(section, /then: Pressure wash · \$150 · Sat Oct 10/)
  assert.ok(section.indexOf('Get three quotes') < section.indexOf('Fix the cracks') && section.indexOf('Pick the colors') < section.indexOf('Pressure wash'), 'in order')
})

test('a project without its steps still reads as before', () => {
  const system = buildFullAiSystem({ ...base, projects: [{ id: 'p1', title: 'Roof', done: 0, total: 3, next: 'Call the roofer' }] })
  assert.match(system, /- (\[[^\]]+\] )?Roof · 0 of 3 steps done · next: Call the roofer/)
})

test('get_coming_up can reach the whole season: up to 120 days, and each season says it has a starter plan', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, title: `Item ${i}`, date: '2026-11-01', daysAway: 30 + i, nextStep: 'Plan it', pokeOn: '2026-10-15' }))
  items.push({ key: 'season:lights:2026', title: 'Christmas lights', date: '2026-11-25', daysAway: 57, nextStep: 'Start the plan', pokeOn: '2026-11-01', startable: true, plan: { steps: 6, minutes: 900, first: 'Get the lights from the storage unit' } })
  const out = comingUpForModel(items, [], { today: '2026-09-29', withinDays: 120 })
  assert.equal(out.items.length, 13, 'all of them when he asks about the season, not five')
  const lights = out.items.find((i) => i.title === 'Christmas lights')
  assert.deepEqual(lights.starter_plan, { steps: 6, first: 'Get the lights from the storage unit' })
  const short = comingUpForModel(items, [], { today: '2026-09-29' })
  assert.ok(short.items.length <= 5, 'the everyday answer stays short')
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'get_coming_up')
  assert.match(tool.description, /120/)
  assert.match(tool.description, /season|holiday|plan/i)
})

test('search_web is described for ideas and prices too, not just plain facts', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'search_web')
  assert.match(tool.description, /ideas/i)
  assert.match(tool.description, /prices/i)
  assert.match(tool.description, /Reddit/)
})

test('a live line says what Casa is doing while he waits', () => {
  assert.equal(fullAiStatus({ name: 'search_web', args: { query: 'outdoor halloween decor ideas florida' } }), 'Searching the web: outdoor halloween decor ideas florida')
  assert.equal(fullAiStatus({ name: 'get_coming_up', args: {} }), 'Checking Coming up…')
  assert.equal(fullAiStatus({ name: 'find_events', args: { query: 'strings' } }), 'Looking through the calendar…')
  assert.equal(fullAiStatus({ name: 'get_weather_forecast', args: {} }), 'Checking the weather…')
  assert.equal(fullAiStatus({ name: 'search_places', args: { query: 'Home Depot' } }), 'Looking up Home Depot…')
  assert.equal(fullAiStatus({ name: 'something_new', args: {} }), 'Looking that up…')
  const long = fullAiStatus({ name: 'search_web', args: { query: 'x'.repeat(200) } })
  assert.ok(long.length <= 80, 'one line on the band')
})

test('the whole Coming up list is in the context, so "the Halloween decorations" is known to have a starter plan', () => {
  const comingUp = [
    { key: 'season:halloween-decor:2026', title: 'Halloween decorations', date: '2026-10-31', daysAway: 32, nextStep: 'Start the plan', pokeOn: '2026-09-15', late: true, startable: true, plan: { steps: 5, minutes: 600, first: 'Bring the bins down from the attic' } },
    { key: 'e9', title: 'Thanksgiving Day', date: '2026-11-26', daysAway: 58, nextStep: 'Who’s hosting', pokeOn: '2026-10-27' },
  ]
  const system = buildFullAiSystem({ ...base, comingUp })
  const section = system.split('\n\n').find((s) => s.startsWith('COMING UP'))
  assert.ok(section, 'a COMING UP section')
  assert.match(section, /Halloween decorations · Sat Oct 31 · plan by Tue Sep 15 \(late\) · next: Start the plan · a starter plan: 5 steps, first "Bring the bins down from the attic"/)
  assert.match(section, /Thanksgiving Day · Thu Nov 26 · plan by Tue Oct 27 · next: Who’s hosting/)
})

test('talking something through leads with substance — ideas or a take — and at most one question; a plan comes once he picks a direction', () => {
  const [intro] = buildFullAiSystem({ ...base, planning: true }).split('\n\n')
  assert.match(intro, /lead with/i)
  assert.match(intro, /at most one question/i)
  assert.match(intro, /once he.s (chosen|picked) a direction/i)
  assert.match(intro, /When he asks you to add or set up a big multi-step/i, 'plan_project straight away only when he asks for one')
})

// Quick questions stay on the fast model (2.5 Flash: 2.5–4 s); talking something through goes to the
// planning model (3.6 Flash: 10–20 s, with the live line) — the fast model decides, by a tool.
test('the fast model can hand a turn to the planning model; the planning model has no such tool', async () => {
  const { fullAiTools, THINK_IT_THROUGH, READ_TOOLS } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const fast = fullAiTools({ planning: false })
  const tool = fast.find((t) => t.name === THINK_IT_THROUGH)
  assert.ok(tool, 'offered to the fast model')
  assert.match(tool.description, /talk something through/i)
  assert.match(tool.description, /quick fact|single change/i)
  assert.match(tool.description, /already/i, 'a follow-up in a conversation that is thinking something through goes too')
  assert.equal(fullAiTools({ planning: true }).some((t) => t.name === THINK_IT_THROUGH), false)
  assert.equal(READ_TOOLS.has(THINK_IT_THROUGH), false, 'not a lookup: it changes who answers')
})

test('ai-assistant switches to the planning model on think_it_through', async () => {
  const fs = await import('node:fs')
  const policy = fs.readFileSync(new URL('../supabase/functions/_shared/llm-model-policy.mjs', import.meta.url), 'utf8')
  assert.match(policy, /export const PLANNING_GEMINI_MODEL = 'gemini-3\.6-flash'/)
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runFullAi = async'), src.indexOf('const runPipeline = async'))
  assert.match(run, /THINK_IT_THROUGH/)
  assert.match(run, /PLANNING_GEMINI_MODEL/)
  // Jake, 2026-09-29: "thinking is way redundant" — the ring and THINKING say it; lines only name a lookup.
  assert.doesNotMatch(run, /emitStatus\('(Thinking it through|Putting it together)…'\)/)
  assert.match(run, /semantic_intent: planning \? 'full_ai\.plan_answer' : 'full_ai\.answer'/, 'a planning answer is told apart in the traces')
})

// Held-out run, 2026-09-29 (twice, traced the second time): "I'm thinking about redoing the backyard,
// can you help me think it through?" — the first thing said, after the wake word — was dropped as an
// aside and got no answer. An aside is the open mic overhearing the room between turns, so it needs
// Casa to have spoken first.
test('the first thing said in a conversation is never dropped as an aside', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const line = src.split('\n').find((l) => l.includes('const asideOnWall ='))
  assert.ok(line)
  assert.match(line, /messages.*some\(\(m.*role === 'assistant'\)/, 'only once Casa has answered in this conversation')
})

// Live check, 2026-09-29: "Make a project for replacing the fence" came back twice as the steps written
// out in words ("I'll set up a project …") — no card, so nothing could be saved.
test('an asked-for project always goes through the card, never steps written out in words', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'plan_project')
  assert.match(tool.description, /never write the steps out in words/i)
})

// Live check, 2026-09-29: with the brainstorming guidance in the fast model's instructions too, "Make a
// project for replacing the fence" was answered with the steps in words half the time. The fast model
// only hands talking-it-through over; the guidance is the planning model's.
test('the fast model is told to hand talking-it-through over, not how to brainstorm', () => {
  const [intro] = buildFullAiSystem(base).split('\n\n')
  assert.match(intro, /think_it_through/)
  assert.doesNotMatch(intro, /lead with substance/i)
  assert.doesNotMatch(intro, /only then offer to set it up/i)
  assert.match(intro, /When he asks you to add or set up a big multi-step project/, 'the project card rule stays')
})

test('ai-assistant rebuilds the instructions for the planning model when it hands a turn over', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  const run = src.slice(src.indexOf('const runFullAi = async'), src.indexOf('const runPipeline = async'))
  assert.match(run, /let system = systemFor\(startPlanning\)/)
  assert.match(run, /model = PLANNING_GEMINI_MODEL\n\s+system = systemFor\(true\)/)
})

// Jake on the wall, 2026-09-29 4:56 PM: "Let's plan Emme's Halloween costume." → the fast model made a
// project card straight away. "I actually wanted to discuss some ideas based on the weather and such,
// not get right to create a plan." Planning something together is talking it through; the card is for
// when he asks for the project itself, or once a talk-through has settled on a direction.
test('planning something together goes to the planning model; the project card waits for the project itself', () => {
  const think = fullAiToolsForTest().find((t) => t.name === 'think_it_through')
  assert.match(think.description, /plan(ning)? something (with him|together)/i)
  const plan = FULL_AI_TOOLS.find((t) => t.name === 'plan_project')
  assert.match(plan.description, /only when he asks for the project itself/i)
  const [intro] = buildFullAiSystem(base).split('\n\n')
  assert.match(intro, /planning something together .* is talking it through/i)
})
