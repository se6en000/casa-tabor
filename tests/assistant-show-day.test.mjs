import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { FULL_AI_TOOLS, READ_TOOLS, fullAiTools, fullAiStatus, readShowDay } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Any day (Jake, 2026-09-29 10:19 PM on the wall): "Show me the events on October 17th" → a list;
// "Can you open this day for me" → it couldn't. Casa gets `show_day`: open a day on the screen when
// asked, or name the day an answer is about so the screen offers to open it. It changes nothing.
test('Casa can put a day on the screen, and it is not a change to anything', () => {
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'show_day')
  assert.ok(tool, 'show_day is a tool')
  assert.match(tool.description, /open this day|open October 17th/i)
  assert.deepEqual(tool.parameters.required, ['date'])
  assert.ok(READ_TOOLS.has('show_day'), 'answered on the server, no card')
  assert.ok(fullAiTools({ planning: false }).some((t) => t.name === 'show_day'))
  assert.equal(fullAiStatus({ name: 'show_day', args: { date: '2026-10-17' } }), null, 'no "Looking that up…" line for it')
})

test('show_day reads a date and whether to open it now', () => {
  assert.deepEqual(readShowDay({ date: '2026-10-17', open: true }), { date: '2026-10-17', open: true })
  assert.deepEqual(readShowDay({ date: '2026-10-17' }), { date: '2026-10-17', open: false })
  assert.equal(readShowDay({ date: 'Oct 17' }), null)
  assert.equal(readShowDay({ date: '2026-02-30' }), null)
  assert.equal(readShowDay(null), null)
})

test('the day travels with the answer to the wall and the phone', () => {
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /call\.name === 'show_day'/)
  assert.match(server, /show_day: shownDay/)
  const client = fs.readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
  assert.match(client, /showDay: data\.show_day/)
})

// Live, 2026-09-30: the model named the day only sometimes ("Can you open this day for me" opened it;
// "Show me the events on October 17th", "Pull up next Friday on the wall" and "Is anything happening on
// Halloween?" named none). The turn reader, which reads every turn, now says which one day the words are
// about and whether he asked to see it — so any answer, fast or full, carries it.
test('the turn reader names the one day a turn is about, and whether to open it', async () => {
  const { buildTurnPrompt, readTurnResolution } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Pull up next Friday on the wall' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now: Wed, Sep 30', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' })
  assert.match(prompt, /"day":/)
  assert.match(prompt, /see, open, show or pull up/)
  assert.deepEqual(readTurnResolution({ act: 'question', is_question: true, day: { date: '2026-10-31', date_basis: 'date', open: false } }).day, { date: '2026-10-31', date_basis: 'date', open: false })
  assert.deepEqual(readTurnResolution({ act: 'other', day: { date: '2026-10-09', date_basis: 'next_week', open: true } }).day, { date: '2026-10-09', date_basis: 'next_week', open: true })
  assert.equal(readTurnResolution({ act: 'add', new_item: { title: 'x' }, day: { date: '2026-10-09', open: false } }).day, null, 'an add is not a day to show')
  assert.equal(readTurnResolution({ act: 'question', day: { date: 'Friday' } }).day, null)
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /settle\(resolution\.day as Record<string, unknown> \| null\)/)
  assert.match(server, /out\.payload\.type === 'text' && !out\.payload\.aside && !out\.payload\.show_day && turnResolution\?\.day/)
})

test('the turn reader sees six weeks of days, so a date a month out is in its list', async () => {
  const { buildTurnPrompt } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Is anything happening on Halloween?' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' })
  assert.match(prompt, /2026-10-31 Saturday, Oct 31/)
})
