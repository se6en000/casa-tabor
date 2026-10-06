#!/usr/bin/env node
// The one full assistant check a night (Jake, Oct 5: "lets do fewer test runs, you still run one full one at night.
// that should be enough and anything you find you can email me about to review in the morning"). Run by cron on the Pi
// at 3:00 AM; during the day a fix gets one live replay of its own words, no batches.
//
// Each situation is said once, as a dry run (nothing is saved), the way the wall asks it. Situations about the
// calendar are built from what's really on it tonight (the next few days' events, an open to-do), so they don't go
// stale. The result goes in public.nightly_checks; the morning routine emails Jake when something failed.
//   node scripts/nightly-assistant-check.mjs [--no-record]
// About 18 turns (~40 model calls, well under the breaker's hourly cap).
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const REF = 'sjiejymuuuqzqukyeagk'
const record = !process.argv.includes('--no-record')

/** SQL through the management API (the Pi has the access token, not a service key). */
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`sql ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

/** One turn, as the wall asks it, never saved. */
async function ask(messages) {
  const t0 = Date.now()
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({
      messages: typeof messages === 'string' ? [{ role: 'user', content: messages }] : messages,
      context: { page: 'wall', currentDate: new Date().toISOString(), utcOffset: offset(), homeCity: 'West Palm Beach' },
      correlation_id: `nightly-check:${t0}`, lane: 'llm', client_trace_present: true, client_build: 'nightly-check', dry_run: true,
    }),
  })
  const body = await res.json().catch(() => ({}))
  // Several cards at once (an email with two things in it) count as the first; the rest are kept to read.
  const first = Array.isArray(body.actions) ? body.actions[0] ?? {} : {}
  return { ms: Date.now() - t0, type: body.type, tool: body.tool ?? first.tool, args: body.args ?? first.args ?? {}, cards: (body.actions ?? []).map((a) => a.tool), intent: body.semantic_intent, wouldAdd: body.would_add, wroteForReal: body.write_verified === true, text: String(body.text ?? body.display_text ?? first.display_text ?? '') }
}
function offset() {
  const m = -new Date().getTimezoneOffset()
  return `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`
}
const card = (r, tool) => r.tool === tool ? null : `expected a ${tool} card, got ${r.tool ? `a ${r.tool} card` : `words: "${r.text.slice(0, 160)}"`}`
const words = (r, re, what) => re.test(r.text) ? null : `expected ${what}, got "${r.text.slice(0, 200)}"`
const noFailure = (r) => (!r.text && !r.tool) ? 'no answer at all' : /lost my train of thought|could not complete|something went wrong/i.test(r.text) ? `failed: "${r.text.slice(0, 120)}"` : null

// What's really there tonight: events in the next 1–10 days (not school-run copies or flights), and open to-dos.
const events = await sql(`select id, title, location_name, start_time from events
  where deleted_at is null and status <> 'cancelled' and event_type = 'event' and record_kind = 'single' and not all_day
    and start_time between now() + interval '20 hours' and now() + interval '10 days'
    and title !~* '^(drop off|pick up|flight|trip )' and title !~ '\\|' and title !~* ' takes '
  order by start_time limit 40`)
const todos = await sql(`select id, title from events where deleted_at is null and status = 'confirmed' and event_type = 'reminder'
  and record_kind = 'single' and length(title) < 50 order by created_at desc limit 20`)
const named = (e) => e.title.replace(/\s*[·:(@].*$/, '').trim()
const unique = events.filter((e) => events.filter((x) => named(x).toLowerCase() === named(e).toLowerCase()).length === 1)
const some = unique[0]
const placed = unique.find((e) => e.location_name && e.id !== some?.id)
const other = unique.find((e) => e.id !== some?.id && e.id !== placed?.id)
const todo = todos[0]
const dayOf = (e) => new Date(e.start_time).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })

// Situations, one wording each (the dev wordings fixes were tuned on stay out of here).
const CASES = [
  ['A calendar question', 'What do we have going on tomorrow?', (r) => noFailure(r) ?? (r.tool ? `expected words, got a ${r.tool} card` : null)],
  ['Weather for a real place', 'Is it going to rain at Okeeheelee Park tomorrow afternoon?', (r) => noFailure(r) ?? words(r, /\d+\s*%|\d+°|rain|dry|clear|cloud/i, 'a forecast')],
  ['A new event with person, time and place', 'Put a dentist appointment on for Liv next Tuesday at 3:30 at Pediatric Dentistry of the Palm Beaches', (r) => card(r, 'create_event') ?? (/Liv/i.test(JSON.stringify(r.args.members ?? '')) ? null : 'Liv not on it') ?? (/T15:30/.test(String(r.args.start)) ? null : `wrong time ${r.args.start}`)],
  ['A reminder', 'remind me to call the vet tomorrow', (r) => (r.tool === 'create_event' || r.tool === 'add_todo') ? null : card(r, 'add_todo')],
  ['An everyday plan said in passing', "I'm going to the gym Thursday at 6 am", (r) => card(r, 'create_event')],
  ['A to-do question', "What's on my to-do list?", (r) => noFailure(r) ?? (r.tool ? `expected words, got a ${r.tool} card` : null)],
  ...(todo ? [['Marking a to-do done', `I finished ${todo.title.toLowerCase()}`, (r) => card(r, 'complete_reminder') ?? (r.args.id === todo.id ? null : `wrong to-do (${r.args.title})`)]] : []),
  // Groceries go straight on the list (no card); on a dry run nothing may be written.
  ['Groceries', 'add milk and a dozen eggs to the grocery list', (r) => r.wroteForReal ? 'a dry run wrote to the real grocery list' : r.intent === 'full_ai.grocery_added' && /milk/i.test(JSON.stringify(r.wouldAdd ?? r.text)) ? null : `got "${r.text.slice(0, 120)}"`],
  ['Keep me posted', "Keep me posted on anything from Liv's softball coach", (r) => card(r, 'keep_me_posted')],
  ['Searching the email', 'Did anything come in from the school this week?', (r) => r.tool ? null : noFailure(r) ?? words(r, /.{20,}/, 'an answer from the email')],
  ...(some ? [
    ['Moving an event', `Move ${named(some)} on ${dayOf(some)} an hour later`, (r) => card(r, 'update_event') ?? (r.args.id === some.id ? null : 'wrong event') ?? (r.args.start ? null : 'no new time')],
    ['Removing an event', `Cancel ${named(some)} on ${dayOf(some)}`, (r) => card(r, 'delete_event') ?? (r.args.id === some.id ? null : 'wrong event')],
  ] : []),
  ...(placed ? [
    ['Naming an event after its place', `Can you use the location of ${named(placed)} on ${dayOf(placed)} to fix its name?`, (r) => card(r, 'update_event') ?? (r.args.title ? null : 'no new name') ?? (r.args.location ? `changed the place to "${r.args.location}"` : null)],
    ['A new place with its street address', `${named(placed)} on ${dayOf(placed)} is at 1225 S Military Trail, West Palm Beach now`, (r) => card(r, 'update_event') ?? (/Military/i.test(String(r.args.location ?? '') + String(r.args.address ?? '')) ? null : 'the new address is missing')],
    ['"The real address" is not a place', [
      { role: 'user', content: `Update the place for ${named(placed)} to Dragon Elites` },
      { role: 'assistant', content: 'Update: location → "Dragon Elites"' },
      { role: 'user', content: "U didn't update the real address. Can u pull it for me" },
    ], (r) => /^(the |that )?(real |actual )?(address|location|place)$/i.test(String(r.args.location ?? '').trim()) ? `a card for place "${r.args.location}"` : noFailure(r)],
  ] : []),
  ...(other ? [['Renaming an event', `Rename ${named(other)} on ${dayOf(other)} to Family check-in`, (r) => card(r, 'update_event') ?? (/family check-in/i.test(String(r.args.title)) ? null : `title "${r.args.title}"`)]] : []),
  ['TV in the background is not a request', 'They came really close in Iowa. Brown ran an amazing race in Ohio, they came so close.', (r) => r.tool ? `made a ${r.tool} card from background talk` : null],
  ['Directions', 'How do I get to Lake Lytal Park?', (r) => r.tool === 'show_directions' || r.type === 'directions' || /lake lytal/i.test(r.text) ? null : `got "${r.text.slice(0, 120)}"`],
]

const results = []
for (const [situation, said, check] of CASES) {
  let r
  let problem
  try {
    r = await ask(said)
    problem = check(r)
  } catch (error) {
    problem = `the call failed: ${error.message}`
  }
  const words = typeof said === 'string' ? said : said.at(-1).content
  results.push({ situation, said: words, ok: !problem, problem: problem ?? null, got: r ? { tool: r.tool ?? null, args: r.args, text: r.text.slice(0, 300), ms: r.ms } : null })
  console.log(`${problem ? 'FAIL' : 'ok  '} ${situation}${problem ? ` — ${problem}` : ''}`)
}
const failed = results.filter((x) => !x.ok)
const summary = failed.length ? `${failed.length} of ${results.length} assistant checks failed: ${failed.map((x) => x.situation).join('; ')}` : `all ${results.length} assistant checks passed`
console.log(summary)
if (record) await sql(`insert into public.nightly_checks (kind, ok, summary, details) values ('assistant', ${failed.length === 0}, ${lit(summary)}, ${lit(JSON.stringify(results))}::jsonb)`)
