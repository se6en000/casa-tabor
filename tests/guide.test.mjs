import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateCandidates, rateAskPrompt, parseRateAsk, rateRows, ratingsToAsk, askAgainAt, whenItWas, STAND_OUT, GO_BACK } from '../supabase/functions/_shared/guide.mjs'

const jake = { id: 'j', name: 'Jake', role: 'parent' }
const kelly = { id: 'k', name: 'Kelly', role: 'parent' }
const liv = { id: 'l', name: 'Liv', role: 'child' }
const giselle = { id: 'g', name: 'Giselle', role: 'caregiver' }
const ev = (title, location_name, address, members, extra = {}) => ({ id: title, title, start_time: '2026-10-03T22:00:00Z', all_day: false, event_type: 'event', location_name, address, members, ...extra })
const HOME = '3209 Washington Rd, West Palm Beach, FL 33405'

test('guide: the calendar\'s real outings are asked about; the runs, routine, appointments and visits are not', () => {
  const events = [
    // Real ones from the family's last weeks (Oct 9).
    ev('Watching college football with the Springmyers', 'mr bs', '5201 Georgia Ave, West Palm Beach, FL, 33405', [kelly, jake]),
    ev('Palm Beach Green Market', 'West Palm Beach Green Market', '100 N. Clematis Street, West Palm Beach, Florida 33401', [{ id: 'e', name: 'Emme', role: 'child' }, jake]),
    ev('SkyZone', 'Sky Zone Trampoline Park', '964 S Congress Ave, Palm Springs, FL 33406, USA', [liv, jake]),
    ev('Drop off Emme & Owen @ Palm Beach Public Elementary School', 'Palm Beach Public Elementary School', '239 Cocoanut Row, Palm Beach, FL, 33480', [jake]),
    ev('Gym', 'Amped Fitness Signature', '2771 S Dixie Hwy, West Palm Beach, FL 33405', [kelly]),
    ev('Kelly Yoga', 'The Yoga Society WPB', '225 Clematis St #200, West Palm Beach, FL 33401, USA', [kelly]),
    ev('Huskies Batting Practice', 'Dragon Elites batting cages', '1225 S Military Trail', [liv, jake]),
    ev('McCranels orthodontist ET OT', 'McCranels Orthodontics', '3201 S Dixie Hwy', [liv, jake]),
    ev('Appointment with Eric Cifuentes at Inyo Salon', 'Ena Beauty Salon', '552-614 Belvedere Rd', [jake]),
    ev('HPSPNA Neighborhood Meeting', 'South Olive Park', '345 Summa St', [jake]),
    ev('Kelly BD Night Out', 'Katherine Cooper\'s House', '238 Edgewood Dr', [kelly]),
    ev('Lizzy\'s 10th Birthday Pool Party Premiere', 'Lizzy\'s House', '611 N. Palmway', [jake]),
    ev('EDS Air Conditioning Appointment', '3209 Washington Rd', '3209 Washington Rd, West Palm Beach, FL 33405, USA', [jake]),
    ev('Conference with Towhid', 'Home', HOME, [kelly, jake]),
    ev('Giselle watches Emme, Owen, and Liv', 'Home', HOME, [giselle, liv]),
    ev('Pick up Photobook for Liv', 'Walgreens, 4001 S Dixie Hwy', 'Walgreens, 4001 S Dixie Hwy', [jake]),
    ev('Softball: RPB Blaze @ Huskies (CANCELED - rained)', 'Lake Lytal Park', '3645 Gun Club Road', [jake]),
    ev('Field Trip: Ballet Palm Beach', 'Glazer Hall', '70 Royal Poinciana Way', [{ id: 'o', name: 'Owen', role: 'child' }]),
    ev('Jacob | Flight AA 1419 DJT→DFW', 'DFW', null, [jake], { leg_type: 'flight_outbound' }),
    ev('Dinner somewhere', 'Blue Door', '', [jake], { all_day: true }),
    ev('Reminder: book Blue Door', 'Blue Door', '', [jake], { event_type: 'reminder' }),
    ev('Date night', '', '', [jake, kelly]),
  ]
  const got = rateCandidates(events, { home: HOME })
  assert.deepEqual(got.map((c) => c.title), ['Watching college football with the Springmyers', 'Palm Beach Green Market', 'SkyZone'])
  // Each parent who went, by name; the children aren't asked.
  assert.deepEqual(got[0].members, [{ id: 'k', name: 'Kelly' }, { id: 'j', name: 'Jake' }])
  assert.deepEqual(got[1].members, [{ id: 'j', name: 'Jake' }])
  assert.equal(got[0].place, 'mr bs')
  // "Lake Lytal Park, 3645 …" reads as its name.
  assert.equal(rateCandidates([ev('Picnic', 'Lake Lytal Park, 3645 Lake Lytal Park, West Palm Beach', 'x', [jake])])[0].place, 'Lake Lytal Park')
})

test('guide: the AI\'s one look keeps only real numbers, once each; the rows are one per parent', () => {
  const c = rateCandidates([
    ev('Watching college football with the Springmyers', 'mr bs', '5201 Georgia Ave', [kelly, jake]),
    ev('Meet Coffee Lady 8:15 - tape up flyers', 'George Petty Park', '3050 Washington Rd', [jake]),
  ])
  const prompt = rateAskPrompt(c)
  assert.match(prompt, /0\. "Watching college football with the Springmyers" at mr bs/)
  assert.match(prompt, /1\. "Meet Coffee Lady/)
  assert.deepEqual(parseRateAsk('```json\n[0, 0, 7, "1", 1.5]\n```', c.length), [0])
  assert.deepEqual(parseRateAsk('nothing here', 2), [])
  const now = new Date('2026-10-04T10:00:00Z')
  const rows = rateRows(c, [0], now)
  assert.deepEqual(rows.map((r) => [r.member_id, r.place, r.status]), [['k', 'mr bs', 'ask'], ['j', 'mr bs', 'ask']])
  assert.equal(rows[0].ask_after, now.toISOString())
})

test('guide: what to ask now — open, not put off, the last three days, oldest first; the phone only its own', () => {
  const now = new Date('2026-10-04T08:00:00-04:00')
  const row = (id, member_id, visited_at, extra = {}) => ({ id, event_id: id, member_id, title: id, place: id, visited_at, status: 'ask', ask_after: '2026-10-04T06:00:00-04:00', ...extra })
  const rows = [
    row('saturday', 'j', '2026-10-03T18:00:00-04:00'),
    row('friday', 'k', '2026-10-02T19:00:00-04:00'),
    row('rated', 'j', '2026-10-03T12:00:00-04:00', { status: 'rated' }),
    row('later', 'j', '2026-10-03T12:00:00-04:00', { ask_after: '2026-10-05T07:00:00-04:00' }),
    row('old', 'j', '2026-09-29T19:00:00-04:00'),
    row('tonight', 'j', '2026-10-04T19:00:00-04:00'),
  ]
  assert.deepEqual(ratingsToAsk(rows, now).map((r) => r.id), ['friday', 'saturday'])
  assert.deepEqual(ratingsToAsk(rows, now, 'j').map((r) => r.id), ['saturday'])
  assert.equal(new Date(askAgainAt(now)).getHours(), 7)
  assert.equal(new Date(askAgainAt(now)).getDate(), 5)
})

test('guide: when it was, as Alexa says it; the answers', () => {
  const now = new Date(2026, 9, 4, 9, 0)
  assert.equal(whenItWas(new Date(2026, 9, 3, 19, 30).toISOString(), now), 'last night')
  assert.equal(whenItWas(new Date(2026, 9, 3, 11, 0).toISOString(), now), 'yesterday')
  assert.equal(whenItWas(new Date(2026, 9, 1, 19, 0).toISOString(), now), 'on Thursday')
  assert.deepEqual(GO_BACK.map(([, l]) => l), ['Yes, soon', 'Someday', 'Once was enough'])
  assert.ok(STAND_OUT.some(([k]) => k === 'loud'))
})

test('guide: Your taste — Jake\'s Oct 9 answers to start; a saved one cleaned, missing parts filled', async () => {
  const { tasteOf, DEFAULT_TASTE } = await import('../supabase/functions/_shared/guide.mjs')
  assert.deepEqual(tasteOf(null), DEFAULT_TASTE)
  assert.ok(!DEFAULT_TASTE.loves.includes('Live music'))
  const t = tasteOf({ loves: [' Oysters ', 'Oysters', '', 'Jazz'], places: [{ name: 'Blue Door', note: 'West Palm' }, { name: ' ' }], reachMin: 12 })
  assert.deepEqual(t.loves, ['Oysters', 'Jazz'])
  assert.deepEqual(t.places, [{ name: 'Blue Door', note: 'West Palm' }])
  assert.equal(t.reachMin, 45)
  assert.deepEqual(t.tryFirst, ['Escape rooms'])
})
