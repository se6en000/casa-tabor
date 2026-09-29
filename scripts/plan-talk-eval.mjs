#!/usr/bin/env node
// Plan it with Casa (P3.25 phase 1): does Casa think with him when he wants to talk something through?
// Situations, not phrases: DEV turns tune the instructions; HELD-OUT turns are only run to check, never
// tuned against. Live AI runs cost money (they tripped the family's limit once): each turn runs once.
//   node scripts/plan-talk-eval.mjs [dev|held|all] [model]
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const key = env.SUPABASE_SERVICE_ROLE_KEY
const DEV = [
  "Let's talk about setting up the Halloween decorations this year.",
  'I think I want to build a Halloween costume for Emme',
  'What should we do for Thanksgiving this year?',
  'Any ideas to make the Christmas lights better this year?',
]
const HELD = [
  "I'm thinking about redoing the backyard, can you help me think it through?",
  'Is it a good idea to paint the house in November?',
  "Help me figure out Liv's birthday party",
]
const which = process.argv[2] ?? 'dev'
const model = process.argv[3]
const turns = which === 'held' ? HELD : which === 'all' ? [...DEV, ...HELD] : DEV
// What a good first reply does (read by a person; the checks below only flag the obvious misses).
const QUESTIONS = /\?/g
for (const said of turns) {
  const t0 = Date.now()
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: said }], context: { page: 'wall', currentDate: new Date().toISOString(), utcOffset: '-04:00', homeCity: 'West Palm Beach' }, correlation_id: `plan-talk-eval:${t0}`, lane: 'llm', client_trace_present: true, client_build: 'plan-talk-eval', stream: true, dry_run: true, ...(model ? { model_override: model } : {}) }),
  })
  const statuses = []
  let final = null
  for (const block of (await res.text()).split('\n\n').filter(Boolean)) {
    const evt = block.match(/^event: (.*)$/m)?.[1]
    const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? '{}')
    if (evt === 'status') statuses.push(data.text)
    if (evt === 'final') final = data
  }
  const text = final?.text ?? final?.display_text ?? ''
  const flags = [
    final?.type !== 'text' ? `made a ${final?.tool ?? final?.type} card unasked` : null,
    (text.match(QUESTIONS) ?? []).length > 2 ? 'more than two questions' : null,
    /would you like (me )?to (set up|add|create)/i.test(text) ? 'steers to an add' : null,
  ].filter(Boolean)
  console.log(`\n### ${said}\n${((Date.now() - t0) / 1000).toFixed(1)} s · ${statuses.length ? statuses.join(' → ') : 'no lookups'}${flags.length ? ` · FLAGS: ${flags.join('; ')}` : ''}\n${text}`)
}
