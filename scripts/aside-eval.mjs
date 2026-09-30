#!/usr/bin/env node
// Asides (overnight queue 4, 2026-09-29): on the wall, after Casa has answered, is the next thing said
// taken as meant for Casa, or dropped as room talk? Dry runs; each line once.
//   node scripts/aside-eval.mjs
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const key = env.SUPABASE_SERVICE_ROLE_KEY
const before = [
  { role: 'user', content: 'Move Emme’s build night to Sunday, Kelly will do it with her.' },
  { role: 'assistant', content: 'Here’s the change for Emme’s build night: Sunday the 18th, with Kelly.' },
]
const FOR_CASA = [
  ['dev', 'Owen changed his mind, he wants to be a skeleton now instead of a ghost.'],
  ['dev', 'Liv’s got a sleepover Friday night.'],
  ['dev', 'Kelly says the dentist moved to Thursday.'],
  ['dev', 'We need to get the lights down from the storage unit this weekend.'],
  ['held', 'Actually Emme wants to be a vampire now.'],
  ['held', 'Grandma’s flying in on the 12th.'],
  ['held', 'The painter can’t come until November.'],
]
const ASIDES = [
  ['aside', 'Owen, get your shoes on, we’re leaving.'],
  ['aside', 'Honey, where did you put my keys?'],
  ['aside', 'Emme stop poking your brother.'],
  ['aside', 'Go brush your teeth, both of you.'],
  // held out: written after the prompt's last change, never tuned against
  ['aside', 'Babe, did you feed the dog?'],
  ['aside', 'Kids, dinner’s ready, come sit down.'],
  ['held', 'Owen needs new cleats before Saturday.'],
]
// Two moments: after a plain answer, and with a card waiting for a yes (the miss: a new subject said
// while a change card was on screen was dropped, 3 of 3).
const CARD = { tool: 'update_event', args: { id: 'x', title: 'Build night', start: '2026-10-18T20:00' } }
const cardBefore = [before[0], { role: 'assistant', content: 'Update: time → Sun, Oct 18 · 8 – 9 PM · add Kelly' }]
let right = 0
let total = 0
for (const [moment, msgs, pending] of [['answer', before, null], ['card  ', cardBefore, CARD]]) {
  for (const [set, said] of [...FOR_CASA, ...ASIDES]) {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [...msgs, { role: 'user', content: said }], context: { page: 'wall', currentDate: new Date().toISOString(), utcOffset: '-04:00', homeCity: 'West Palm Beach', ...(pending ? { pendingAction: pending } : {}) }, lane: 'llm', client_trace_present: true, client_build: 'aside-eval', stream: false, dry_run: true }) })
    const d = await res.json()
    const aside = d.aside === true
    const ok = set === 'aside' ? aside : !aside
    total += 1
    if (ok) right += 1
    console.log(`${ok ? 'ok  ' : 'MISS'} ${moment} ${set.padEnd(5)} ${aside ? 'aside ' : 'for me'} · ${said}`)
  }
}
console.log(`\n${right} of ${total} right`)
