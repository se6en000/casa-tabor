import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, buildFullAiSystem, comingUpForModel, fullAiStatus } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// P3.25 phase 1 (Plan it with Casa): the assistant can talk. Jake, 2026-09-29 9:14 AM: "Right now
// she feels very strict and just like do you wanna add something to the calendar or add something to
// the to do list? But there's no real thinking or conversation behind the ideas, whether it's a good
// idea or a bad idea." And on the design doc: web lookups for prices, Reddit and what's local; extra
// time is fine when planning "as long as it does a good job".

const now = new Date('2026-09-29T10:00:00-04:00')
const base = { family: [{ name: 'Jake', role: 'parent', can_drive: true }], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now, homeCity: 'West Palm Beach' }

test('the instructions let Casa think with him: ideas, an honest opinion, push back, and no steering to an add', () => {
  const [intro] = buildFullAiSystem(base).split('\n\n')
  assert.match(intro, /talk (it|something) through/i)
  assert.match(intro, /real ideas/i)
  assert.match(intro, /honest opinion/i)
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
  assert.match(system, /- Roof · 0 of 3 steps done · next: Call the roofer/)
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
