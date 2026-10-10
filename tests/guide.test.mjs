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

test('guide: what to ask now — open, not put off, the last week, oldest first; the phone only its own', () => {
  const now = new Date('2026-10-04T08:00:00-04:00')
  const row = (id, member_id, visited_at, extra = {}) => ({ id, event_id: id, member_id, title: id, place: id, visited_at, status: 'ask', ask_after: '2026-10-04T06:00:00-04:00', ...extra })
  const rows = [
    row('saturday', 'j', '2026-10-03T18:00:00-04:00'),
    row('friday', 'k', '2026-10-02T19:00:00-04:00'),
    row('rated', 'j', '2026-10-03T12:00:00-04:00', { status: 'rated' }),
    row('later', 'j', '2026-10-03T12:00:00-04:00', { ask_after: '2026-10-05T07:00:00-04:00' }),
    row('old', 'j', '2026-09-26T19:00:00-04:00'),
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
  assert.deepEqual(t.interests, [])
})

test('guide: interests — kept whole through a save; cleaned, once each per person', async () => {
  const { tasteOf } = await import('../supabase/functions/_shared/guide.mjs')
  const t = tasteOf({ interests: [
    { name: ' Yoga ', who: 'kelly', level: 'love', group: 'move', why: 'Thrive Power Yoga' },
    { name: 'yoga', who: 'kelly', level: 'like' },
    { name: 'Yoga', who: 'jake', level: 'meh', group: 'nope' },
    { name: '' },
    { name: 'Markets', who: 'kids' },
  ] })
  assert.deepEqual(t.interests, [
    { name: 'Yoga', who: 'kelly', level: 'love', group: 'move', why: 'Thrive Power Yoga' },
    { name: 'Yoga', who: 'jake', level: 'like', group: 'do' },
    { name: 'Markets', who: 'us', level: 'like', group: 'do' },
  ])
  // The phone's Your taste saves the whole taste back: interests ride along.
  assert.deepEqual(tasteOf({ ...t, loves: ['Oysters'] }).interests, t.interests)
})

test('guide buzz: the shelves follow Your taste — a love of their own is searched as written; taking one off drops it', async () => {
  const { guideShelves, DEFAULT_TASTE } = await import('../supabase/functions/_shared/guide.mjs')
  const ids = guideShelves(DEFAULT_TASTE).map((s) => s.id)
  assert.deepEqual(ids, ['oysters', 'bars', 'gameday', 'trivia', 'hotel', 'vintage', 'spooky', 'escape'])
  const mine = guideShelves({ ...DEFAULT_TASTE, loves: ['Oysters', 'Jazz'], tryFirst: [] })
  assert.deepEqual(mine.map((s) => s.id), ['oysters', 'own:jazz'])
  assert.deepEqual(mine[1].queries, ['Jazz'])
})

test('guide buzz: a place is checked — open, liked, not a chain, within reach (a little past it allowed, marked)', async () => {
  const { placeVerdict } = await import('../supabase/functions/_shared/guide.mjs')
  const home = { lat: 26.69, lng: -80.06 }
  const p = (name, lat, lng, extra = {}) => ({ displayName: { text: name }, businessStatus: 'OPERATIONAL', rating: 4.6, userRatingCount: 300, location: { latitude: lat, longitude: lng }, ...extra })
  assert.deepEqual(placeVerdict(p('Blind Monk', 26.71, -80.05), home), { ok: true, minutes: 10, beyond: false })
  assert.equal(placeVerdict(p('Some Bar FTL', 26.1224, -80.1373), home).beyond, true)
  assert.equal(placeVerdict(p('Far Away', 25.77, -80.19), home).ok, false)
  assert.equal(placeVerdict(p('Hooters', 26.71, -80.05), home).note, 'a chain')
  assert.equal(placeVerdict(p('Closed Bar', 26.71, -80.05, { businessStatus: 'CLOSED_PERMANENTLY' }), home).note, 'not open')
  assert.equal(placeVerdict(p('Meh Bar', 26.71, -80.05, { rating: 3.9 }), home).ok, false)
  assert.equal(placeVerdict(p('Tiny', 26.71, -80.05, { userRatingCount: 8 }), home).ok, false)
})

test('guide buzz: what locals say is parsed as said, once a place; names match loosely', async () => {
  const { parseBuzz, sameName, buzzPrompt, GUIDE_SHELVES } = await import('../supabase/functions/_shared/guide.mjs')
  assert.match(buzzPrompt(GUIDE_SHELVES[0], 'Friday, October 9, 2026'), /oysters & raw bars places in Palm Beach County/)
  const got = parseBuzz('```json\n[{"name":"The Blind Monk","town":"West Palm Beach","said":"Locals\' wine bar, great by-the-glass list","kind":"reddit","new":false},{"name":"Blind Monk","kind":"press"},{"name":"Grato","said":"","kind":"blog","new":true},{"town":"x"}]\n```')
  assert.deepEqual(got, [
    { name: 'The Blind Monk', town: 'West Palm Beach', said: 'Locals\' wine bar, great by-the-glass list', kind: 'reddit', new: false },
    { name: 'Grato', town: null, said: null, kind: 'press', new: true },
  ])
  assert.ok(sameName('The Blind Monk', 'Blind Monk WPB'))
  assert.ok(sameName('Mr B’s', "Mr B's Bar"))
  assert.ok(!sameName('Monk', 'Blind Monk'))
})

test('guide buzz: labels only on evidence; what was heard, in one line; the order', async () => {
  const { guideLabels, heardLine, reviewTrend, guideScore } = await import('../supabase/functions/_shared/guide.mjs')
  const now = new Date('2026-10-30T12:00:00Z')
  const trend = reviewTrend([{ seen_on: '2026-10-02', rating_count: 100 }, { seen_on: '2026-10-09', rating_count: 112 }, { seen_on: '2026-10-30', rating_count: 130 }], now)
  assert.deepEqual(trend, { added: 30, growth: 0.3, days: 28 })
  assert.equal(reviewTrend([{ seen_on: '2026-10-30', rating_count: 100 }], now), null)
  const reddit = [{ kind: 'reddit', said: 'Best happy-hour oysters in town', new: false }]
  assert.deepEqual(guideLabels({ rating: 4.5, rating_count: 900 }, { buzz: reddit }), ['local'])
  assert.deepEqual(guideLabels({ rating: 4.5, rating_count: 900, touristy: true }, { buzz: reddit }), [])
  assert.deepEqual(guideLabels({ rating: 4.4, rating_count: 100 }, { trend }), ['hot'])
  assert.deepEqual(guideLabels({ rating: 4.4, rating_count: 100 }, { buzz: [{ kind: 'press', new: true }] }), ['hot'])
  // Sweetwater, Oct 9: "new" in a write-up, 1,069 reviews on Google — not new.
  assert.deepEqual(guideLabels({ rating: 4.6, rating_count: 1069 }, { buzz: [{ kind: 'press', new: true }] }), [])
  assert.equal(heardLine({ rating: 4.5, rating_count: 460 }, { buzz: [{ kind: 'reddit' }, { kind: 'press' }] }), 'Talked up on Reddit and in the local press · 4.5 from 460 Google reviews.')
  assert.deepEqual(guideLabels({ rating: 4.8, rating_count: 140 }), ['gem'])
  assert.deepEqual(guideLabels({ rating: 4.8, rating_count: 1400 }), [])
  assert.deepEqual(guideLabels({ rating: 4.4, rating_count: 140 }), [])
  assert.equal(heardLine({ rating: 4.6, rating_count: 210 }, { buzz: reddit, trend }), 'Talked up on Reddit · 30 new Google reviews in 28 days · 4.6 from 210 Google reviews. Best happy-hour oysters in town.')
  assert.equal(heardLine({ rating: 4.8, rating_count: 140 }), '4.8 from 140 Google reviews.')
  assert.ok(guideScore({ labels: ['local'], rating: 4.5, mentions: 2 }) > guideScore({ labels: [], rating: 4.9 }))
  assert.ok(guideScore({ labels: ['gem'], rating: 4.8 }) > guideScore({ labels: ['gem'], rating: 4.8, beyond: true }))
})

test('guide buzz: the AI\'s look — keep, touristy, why — by number; unanswered stays as it was', async () => {
  const { curatePrompt, parseCurate } = await import('../supabase/functions/_shared/guide.mjs')
  const prompt = curatePrompt([{ name: 'Grato', shelf_label: 'Neighborhood bars', address: '1901 S Dixie', types: 'bar', rating: 4.6, rating_count: 2000 }], { loves: ['Oysters'], places: [{ name: 'Blue Door' }] })
  assert.match(prompt, /They love: Oysters, Blue Door/)
  assert.match(prompt, /0\. Grato — Neighborhood bars/)
  const got = parseCurate('[{"i":0,"keep":false,"touristy":false,"why":"x"},{"i":1,"touristy":true,"why":"  Oysters on the water, made for a slow evening  "},{"i":9,"keep":true}]', 3)
  assert.deepEqual([...got.entries()], [[0, { keep: false, touristy: false, why: 'x' }], [1, { keep: true, touristy: true, why: 'Oysters on the water, made for a slow evening' }]])
})

test('guide page: places by shelf, the best few of each in the guide\'s order; Not for us stays out; the town', async () => {
  const { placesByShelf, townOf } = await import('../supabase/functions/_shared/guide.mjs')
  const p = (id, shelf, status = 'live') => ({ id, shelf, shelf_label: shelf, status })
  const got = placesByShelf([p('a', 'vintage'), p('b', 'oysters'), p('c', 'oysters'), p('d', 'oysters'), p('e', 'oysters'), p('f', 'own:jazz'), p('g', 'oysters', 'not_for_us')], 3)
  assert.deepEqual(got.shown.map((s) => [s.shelf, s.places.map((x) => x.id)]), [['oysters', ['b', 'c', 'd']], ['vintage', ['a']], ['own:jazz', ['f']]])
  assert.equal(got.more, 1)
  assert.equal(got.total, 6)
  assert.equal(townOf('2141 S Federal Hwy, Delray Beach, FL 33483, USA'), 'Delray Beach')
  assert.equal(townOf(null), null)
})
