import test from 'node:test'
import assert from 'node:assert/strict'

// Bug report 2026-09-27 ("we need … a way to search for things and be able to retrieve events that happened
// in the past or in the future"), still open 2026-09-30: "is there any appointment mentioning Gilbert?" was
// answered from the next weeks alone (today's pill) — the calendar holds nine Gilbert events, the Sep 10 vet
// visit among them. A question about any or every time, the last time, or the past needs the whole calendar.
test('the turn reader sends "any / every / the last time / the past" questions on to the whole-calendar search', async () => {
  const { buildTurnPrompt } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Is there any appointment mentioning Gilbert?' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' })
  assert.match(prompt, /any or every time something happens or happened, the last or first time, or anything before today — is false/)
})

test('the full model searches with words and no dates for those, which covers two years either way', async () => {
  const { FULL_AI_TOOLS, findEventsRange } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  assert.match(FULL_AI_TOOLS.find((t) => t.name === 'find_events').description, /any or every time, the last time, or the past: words and no dates/)
  assert.deepEqual(findEventsRange({ query: 'Gilbert' }, '2026-09-30'), { from: '2024-09-30', to: '2028-09-30', words: ['gilbert'] })
})

// Live after the first try: the reader still answered "any appointment mentioning Gilbert" from the next
// weeks, and the model said "I can only see events for the next three weeks". Now the reader names the
// search and the server runs it (the same search as find_events), then answers from what it found.
test('the reader names a whole-calendar search; the server runs it and answers from it', async () => {
  const { readTurnResolution } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  assert.deepEqual(readTurnResolution({ act: 'question', search: { words: 'Gilbert vet', from: null, to: null } }).search, { query: 'Gilbert vet', from: null, to: null })
  assert.deepEqual(readTurnResolution({ act: 'question', search: { words: 'yoga', from: '2026-09-01', to: 'soon' } }).search, { query: 'yoga', from: '2026-09-01', to: '2028-09-01' }, 'from a date on')
  // Live, 2026-09-30: "from: today" alone found only today; "to: today" alone found nothing.
  assert.deepEqual(readTurnResolution({ act: 'question', search: { words: 'Gilbert', from: '2026-09-30', to: null } }, { today: '2026-09-30' }).search, { query: 'Gilbert', from: null, to: null }, '"from today" alone is the reader’s default: the whole calendar')
  assert.deepEqual(readTurnResolution({ act: 'question', search: { words: 'Gilbert', from: '2026-10-05', to: null } }, { today: '2026-09-30' }).search, { query: 'Gilbert', from: '2026-10-05', to: '2028-10-05' })
  assert.deepEqual(readTurnResolution({ act: 'question', search: { words: 'Kelly yoga', from: null, to: '2026-09-30' } }).search, { query: 'Kelly yoga', from: '2024-09-30', to: '2026-09-30' })
  assert.equal(readTurnResolution({ act: 'add', new_item: { title: 'x' }, search: { words: 'x' } }).search, null)
  const fs = await import('node:fs')
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /} else if \(resolution\.search\) \{/)
  assert.match(server, /const searched = await searchCalendar\(sb, resolution\.search/)
  assert.match(server, /const searched = await searchCalendar\(sb, call\.args/)
})
