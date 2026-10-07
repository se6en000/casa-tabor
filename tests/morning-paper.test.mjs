import test from 'node:test'
import assert from 'node:assert/strict'
import { skyFacts, paperPrompt, parsePaperWords, cleanFacts } from '../supabase/functions/_shared/morning-paper.mjs'

// Wednesday Oct 7, West Palm Beach (Open-Meteo, fetched Oct 6).
const hourly = {
  time: Array.from({ length: 24 }, (_, h) => `2026-10-07T${String(h).padStart(2, '0')}:00`),
  temperature_2m: [74, 74, 74, 74, 74, 75, 75, 76, 76, 79, 80, 80, 82, 84, 84, 83, 81, 82, 79, 77, 76, 76, 75, 75],
  precipitation_probability: [5, 5, 5, 5, 5, 8, 11, 12, 12, 10, 9, 12, 14, 14, 22, 34, 37, 34, 39, 42, 49, 45, 30, 20],
}

test('the sky in facts: the morning, the high, when rain gets likely', () => {
  assert.equal(skyFacts(hourly), '76° at 7 AM; high 84° about 1 PM; rain chance 30% or more from 3 PM, up to 49% about 8 PM')
  assert.equal(skyFacts({ time: [] }), null)
})

const facts = {
  date: '2026-10-07', day: 'Wednesday, October 7, 2026',
  runs: [{ at: '7:00', text: 'Giselle takes Emme & Owen to Palm Beach Public', alert: null }, { at: '6:00', text: 'Liv · Huskies Softball Practice at Lake Lytal Park', alert: 'no driver yet' }],
  away: ['Jake flies to Dallas, leaving at 12:45'], also: ['Emme · Unit 2 Reading test'], weatherNow: null,
}

test('the prompt carries every fact, the alert, and the rules', () => {
  const p = paperPrompt(facts, skyFacts(hourly))
  assert.match(p, /6:00 · Liv · Huskies Softball Practice at Lake Lytal Park \(no driver yet\)/)
  assert.match(p, /Away or travelling: Jake flies to Dallas, leaving at 12:45/)
  assert.match(p, /All day today: Emme · Unit 2 Reading test/)
  assert.match(p, /Sky: 76° at 7 AM/)
  assert.match(p, /Family facts only from the lists above/)
})

test('the reply: three clean lines, or nothing', () => {
  assert.deepEqual(parsePaperWords('```json\n{"headline":"Jake flies to Dallas; Liv’s practice at 6 needs a driver.","deck":"Giselle has the 7:00 school run.","sky":"Warm, showers after 3."}\n```'),
    { headline: 'Jake flies to Dallas; Liv’s practice at 6 needs a driver.', deck: 'Giselle has the 7:00 school run.', sky: 'Warm, showers after 3.' })
  assert.equal(parsePaperWords('no json here'), null)
  assert.equal(parsePaperWords('{"headline":""}'), null)
  assert.equal(parsePaperWords(`{"headline":"${'x'.repeat(130)}","deck":"","sky":""}`), null)
  assert.equal(parsePaperWords('{"headline":"Sunny day ☀️","deck":"","sky":""}'), null)
})

test('the facts are kept to their shape (the wall’s key can call it)', () => {
  assert.equal(cleanFacts({ date: 'tomorrow' }), null)
  const c = cleanFacts({ ...facts, runs: Array.from({ length: 30 }, () => ({ at: '7:00', text: 'x'.repeat(500) })), extra: 'drop me' })
  assert.equal(c.runs.length, 12)
  assert.equal(c.runs[0].text.length, 120)
  assert.equal('extra' in c, false)
})

// Canvas 58, the morning brief (Jake, Oct 6: "surprise me … you can adjust this every day without my permission").
test('the brief’s prompt carries the week, Coming up, projects, what’s gone quiet and what the search found — and the family-wall rules', async () => {
  const { paperPrompt, searchPrompt } = await import('../supabase/functions/_shared/morning-paper.mjs')
  const facts = { date: '2026-09-25', day: 'Friday, September 25, 2026', runs: [], away: [], also: [], weatherNow: null }
  const more = { people: ['Jake', 'Kelly'], week: [{ day: 'Saturday, Sep 26', lines: ['12:30 Softball'] }], comingUp: [{ title: 'Halloween', date: '2026-10-31', daysAway: 36, nextStep: 'Plan costumes', late: false }], projects: [{ title: 'Treehouse', done: 2, total: 6, next: 'Buy the lumber', aim: null }], quiet: ['Call the plumber (put off 3 times)'] }
  const prompt = paperPrompt(facts, null, more, 'Ela Curry & Cocktails, West Palm Beach — MICHELIN Guide 2026')
  for (const piece of ['Saturday, Sep 26: 12:30 Softball', '36 days · Halloween · Plan costumes', 'Treehouse (2 of 6) · next: Buy the lumber', 'Call the plumber (put off 3 times)', 'Ela Curry & Cocktails', 'Never mention gifts', "never at a child's expense"]) {
    assert.ok(prompt.includes(piece), piece)
  }
  // Without the extras it's still the three-line paper.
  assert.ok(!paperPrompt(facts, null).includes('Coming up (days away'))
  assert.match(searchPrompt('West Palm Beach, FL', 'Friday, September 25, 2026', 'Sunday, October 4'), /date night[\s\S]*between today and Sunday, October 4[\s\S]*Nothing outside those dates/)
})

test('the brief from the model: four columns of at most three, the forgotten thing, the surprise, the aside — cut to size; emoji still refused', async () => {
  const { parsePaperWords } = await import('../supabase/functions/_shared/morning-paper.mjs')
  const reply = JSON.stringify({
    headline: 'Spirit Day,', turn: 'and a big Saturday coming.', deck: 'Giselle has both pickups.', sky: 'Warm, 86° by two.',
    today: [{ title: 'Nothing’s wrong', detail: 'Every run has a driver.' }, { title: 'a', detail: 'b' }, { title: 'c', detail: 'd' }, { title: 'e', detail: 'f' }],
    weekend: [{ title: 'Pack tonight', detail: 'x'.repeat(400) }], month: [], wayOut: [{ title: '', detail: 'no title' }],
    forgot: { title: 'The treehouse', detail: 'Step 2 of 6.' }, feature: { label: 'Worth a try · date night', title: 'Ela Curry & Cocktails', detail: 'Next Friday is free.' }, aside: 'The Taborville Classic.',
  })
  const words = parsePaperWords(reply)
  assert.equal(words.headline, 'Spirit Day,')
  assert.equal(words.brief.turn, 'and a big Saturday coming.')
  assert.equal(words.brief.today.length, 3)
  assert.ok(words.brief.weekend[0].detail.length <= 180)
  assert.deepEqual(words.brief.wayOut, [])
  assert.equal(words.brief.feature.label, 'Worth a try · date night')
  assert.equal(words.brief.aside, 'The Taborville Classic.')
  assert.equal(parsePaperWords(JSON.stringify({ headline: 'Hi', deck: '', sky: '', today: [{ title: 'Party 🎉', detail: '' }] })), null)
  // The old three-line reply still parses, with no brief.
  assert.equal(parsePaperWords(JSON.stringify({ headline: 'An easy Friday.', deck: '', sky: '' })).brief, undefined)
})
