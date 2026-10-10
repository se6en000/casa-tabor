import test from 'node:test'
import assert from 'node:assert/strict'

const TODAY = '2026-10-09'
const place = (id, name, extra = {}) => ({ id, name, address: `1 Main St, West Palm Beach, FL 33401, USA`, shelf: 'bars', shelf_label: 'Neighborhood bars', drive_min: 7, beyond: false, rating: 4.5, rating_count: 200, maps_url: null, website: null, buzz: [], labels: [], heard: null, why: null, touristy: false, status: 'saved', whose: 'us', origin: 'guide', note: null, saved_at: '2026-10-09T22:00:00Z', score: 1, ...extra })
const outing = (id, title, when, extra = {}) => ({ id, kind: 'couple', title, when, recurring: null, place: 'Somewhere', address: null, url: null, why: null, free: null, drive_min: null, rating: null, rating_count: null, gem: false, status: 'new', ...extra })

test('your list: when words — tonight, a weekday this week, the date further out; times as a clock', async () => {
  const { dayWord, clock } = await import('../supabase/functions/_shared/your-list.mjs')
  assert.equal(dayWord('2026-10-09', TODAY), 'TONIGHT')
  assert.equal(dayWord('2026-10-10', TODAY), 'TOMORROW')
  assert.equal(dayWord('2026-10-13', TODAY), 'TUE')
  assert.equal(dayWord('2026-10-24', TODAY), 'SAT OCT 24')
  assert.equal(clock('18:00'), '6 PM')
  assert.equal(clock('20:30'), '8:30 PM')
  assert.equal(clock(null), null)
})

test('your list: a place says why it’s here — on your list or your spot, asked about, whose; their own words first', async () => {
  const { placeItem } = await import('../supabase/functions/_shared/your-list.mjs')
  const loco = placeItem(place('1', 'Loco', { buzz: [{ kind: 'shared', said: 'a tequila and oyster bar.', new: false, url: null }] }), { today: TODAY })
  assert.deepEqual(loco.tags, ['try'])
  assert.equal(loco.heard, '“a tequila and oyster bar” — in your words.')
  assert.equal(loco.when, '')
  const mary = placeItem(place('2', 'Mary Lou’s', { whose: 'kelly' }), { today: TODAY })
  assert.deepEqual(mary.tags, ['try', 'kelly'])
  const okl = placeItem(place('3', 'Old Key Lime House', { origin: 'asked', note: 'You asked Alexa what was playing here.' }), { today: TODAY })
  assert.deepEqual(okl.tags, ['try', 'asked'])
  assert.equal(okl.when, '')
  assert.equal(okl.why, 'You asked Alexa what was playing here.')
  const spot = placeItem(place('4', 'Blue Door', { status: 'spot' }), { today: TODAY, calendar: { 4: { next: '2026-10-10', last: null } } })
  assert.deepEqual(spot.tags, ['spot'])
  assert.equal(spot.when, 'ON THE CALENDAR TOMORROW')
  const capri = placeItem(place('5', 'Bar Capri', { status: 'live', labels: ['hot', 'local'] }), { today: TODAY, surprise: true })
  assert.deepEqual(capri.tags, ['hot', 'local'])
  assert.equal(capri.when, 'SURPRISE · NOT ON YOUR LIST')
})

test('your list: the calendar finds a list place by its name in a title or a location — next on, last went', async () => {
  const { calendarHits } = await import('../supabase/functions/_shared/your-list.mjs')
  const hits = calendarHits([{ id: 'a', name: 'Loco West Palm Beach' }, { id: 'b', name: 'Mr B’s Tavern' }, { id: 'c', name: 'The Park' }], [
    { title: 'Dinner at Loco', location_name: null, start_time: '2026-10-17T19:00:00Z' },
    { title: 'Watching college football with the Springmyers', location_name: 'mr bs', start_time: '2026-10-03T16:00:00Z' },
    { title: 'Mr B’s Tavern', location_name: null, start_time: '2026-09-01T16:00:00Z' },
    { title: 'Coffee in the park', location_name: 'George Petty Park', start_time: '2026-09-26T12:00:00Z' },
  ], TODAY)
  assert.deepEqual(hits.a, { next: '2026-10-17', last: null })
  assert.deepEqual(hits.b, { next: null, last: '2026-09-01' })
  // "The Park" is too short a name to find on its own.
  assert.equal(hits.c, undefined)
})

test('your list: four highlights — no slot a kind: the most wanted now (asked, soon, their own), the rest below soonest first', async () => {
  const { yourList, placeItem } = await import('../supabase/functions/_shared/your-list.mjs')
  const watches = [
    { id: 'w1', name: 'Candlelight', kind: 'again', whose: 'us', note: 'You loved 90s Hip-Hop on Strings.' },
    { id: 'w2', name: 'Ballet', kind: 'asked', whose: 'family', note: 'You asked Alexa about ballet.' },
  ]
  const places = [
    place('p1', 'Loco', { saved_at: '2026-10-09T20:00:00Z', shelf: 'mexican' }),
    place('p2', 'J&C Oyster', { saved_at: '2026-10-10T02:19:00Z', shelf: 'oysters' }),
    place('p3', 'Blue Door', { status: 'spot', saved_at: null, shelf: 'cocktails' }),
    place('p4', 'Old Key Lime House', { origin: 'asked', shelf: 'waterfront' }),
    place('s1', 'Bar Capri', { status: 'live', labels: ['hot'], score: 9, shelf: 'italian' }),
    place('s2', 'Some Pick', { status: 'live', labels: [], score: 10 }),
  ]
  const outings = [
    outing('c1', 'Candlelight: A Haunted Evening', '2026-10-24 18:30', { watch_id: 'w1' }),
    outing('c2', 'Candlelight: Queen', '2026-12-05 20:30', { watch_id: 'w1' }),
    outing('c3', 'Candlelight: Fleetwood Mac', '2026-12-11 20:30', { watch_id: 'w1' }),
    outing('n1', 'The Nutcracker', '2026-12-04 19:00', { watch_id: 'w2', kind: 'family' }),
    outing('m1', 'Big City', '2026-10-09 19:00', { kind: 'music', venue_kind: 'cover', act: { standing: 'liked', genre: 'party rock' } }),
    outing('m2', 'Some local band', '2026-10-09 19:00', { kind: 'music', venue_kind: 'original', act: { standing: 'local' } }),
    outing('x', 'Past', '2026-10-01 19:00', { watch_id: 'w1' }),
  ]
  const page = yourList({ places, outings, watches, today: TODAY, nowTime: '10:30' })
  const top = page.highlights.map((h) => h.title)
  assert.equal(top.length, 4)
  // What they asked about, and a cover band tonight, lead; one Candlelight on top at most.
  assert.deepEqual(top.slice(0, 2), ['Old Key Lime House', 'Big City'])
  assert.ok(top.filter((t) => t.startsWith('Candlelight')).length <= 1)
  // One they shared themselves comes before the guide's picks they tapped Save on, however new those are.
  const shared = yourList({ places: [...places, place('p5', 'Mary Lou’s', { origin: 'shared', saved_at: '2026-10-09T20:55:00Z', shelf: 'clubs' })], outings, watches, today: TODAY, nowTime: '10:30' })
  const sharedTop = shared.highlights.map((h) => h.title)
  assert.ok(sharedTop.includes('Mary Lou’s') && !sharedTop.includes('J&C Oyster'))
  assert.equal(placeItem(place('p6', 'Palm Beach Ice Works', { origin: 'asked', types: 'Ice skating rink' }), { today: TODAY }).is, 'Ice skating rink')
  // Below, soonest first; the third Candlelight waits (two a watch); nothing over, nothing unlabeled from the guide.
  const below = page.more.map((h) => h.title)
  const all = [...top, ...below]
  assert.ok(!all.includes('Some local band') && !all.includes('Past') && !all.includes('Some Pick'))
  assert.deepEqual(page.more.map((h) => h.date ?? '2026-10-11'), [...page.more.map((h) => h.date ?? '2026-10-11')].sort())
  assert.ok(all.includes('Candlelight: Queen') && all.includes('Bar Capri'))
  assert.deepEqual(page.later.map((h) => h.title), ['Candlelight: Fleetwood Mac'])
  assert.deepEqual(page.counts, { places: 4, onCalendar: 0, later: 1 })
  const nut = [...page.highlights, ...page.more].find((h) => h.title === 'The Nutcracker')
  assert.deepEqual(nut.tags, ['asked', 'family'])
  assert.equal(nut.when, 'FRI DEC 4 · 7 PM')
  assert.equal(nut.why, 'You asked Alexa about ballet.')
})

test('your list: it learns — Not for us twice on a kind moves it off the top, the next best slides in; saves lift a kind', async () => {
  const { yourList, tallyLeanings, leaning } = await import('../supabase/functions/_shared/your-list.mjs')
  const places = [
    place('a', 'Oyster Bar', { shelf: 'oysters', saved_at: '2026-09-01T00:00:00Z' }),
    place('b', 'Taco Spot', { shelf: 'mexican', saved_at: '2026-09-01T00:00:00Z' }),
    place('c', 'Pub', { shelf: 'bars', saved_at: '2026-09-01T00:00:00Z' }),
    place('d', 'Wine Room', { shelf: 'wine', saved_at: '2026-09-01T00:00:00Z' }),
    place('e', 'Margarita Patio', { shelf: 'margaritas', saved_at: '2026-09-01T00:00:00Z' }),
  ]
  const outings = [outing('t1', 'Trivia at the Pub', '2026-10-10 19:00', { kind: 'trivia' })]
  const before = yourList({ places, outings, today: TODAY }).highlights.map((h) => h.title)
  assert.equal(before[0], 'Trivia at the Pub')
  // Two trivia nights said no to (and one taco place): trivia drops, Margarita Patio comes up.
  const leanings = tallyLeanings({ outings: [outing('t0', 'Old trivia', '2026-10-01 19:00', { kind: 'trivia', status: 'not_for_us' }), outing('t9', 'More trivia', '2026-10-02 19:00', { kind: 'trivia', status: 'not_for_us' })], places: [place('z', 'Gone', { shelf: 'mexican', status: 'not_for_us' })] })
  assert.deepEqual(leanings['night:trivia'], { yes: 0, no: 2 })
  assert.ok(leaning(leanings, 'night:trivia') < -2)
  const after = yourList({ places, outings, today: TODAY, leanings }).highlights.map((h) => h.title)
  assert.ok(!after.includes('Trivia at the Pub') && !after.includes('Taco Spot'))
  assert.ok(after.includes('Margarita Patio'))
  // Saved oysters twice: oysters first among the places.
  const liked = yourList({ places, outings: [], today: TODAY, leanings: tallyLeanings({ places: [place('y1', 'X', { shelf: 'oysters' }), place('y2', 'Y', { shelf: 'oysters', status: 'been' })] }) })
  assert.equal(liked.highlights[0].title, 'Oyster Bar')
})

test('your list: a night already over today is gone; the surprise changes week to week', async () => {
  const { yourList, surprisePick } = await import('../supabase/functions/_shared/your-list.mjs')
  const page = yourList({ outings: [outing('m1', 'Early show', '2026-10-09 09:00', { kind: 'music', venue_kind: 'cover', act: { standing: 'liked' } })], today: TODAY, nowTime: '10:30' })
  assert.equal(page.highlights.length, 0)
  const picks = [place('a', 'A', { status: 'live', labels: ['hot'], score: 3 }), place('b', 'B', { status: 'live', labels: ['gem'], score: 2 })]
  assert.notEqual(surprisePick(picks, '2026-10-09').id, surprisePick(picks, '2026-10-16').id)
})

test('your list: what waits for later, in a line', async () => {
  const { laterLine } = await import('../supabase/functions/_shared/your-list.mjs')
  assert.equal(laterLine([{ title: 'A' }, { title: 'B' }]), 'A and B')
  assert.equal(laterLine([{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }, { title: 'E' }, { title: 'F' }]), 'A, B, C, D and 2 more')
  assert.equal(laterLine([]), null)
})

test('watching: dates kept only when whole — a title, a real date in the window, a page; once each', async () => {
  const { parseWatchEvents, watchOuting } = await import('../supabase/functions/_shared/your-list.mjs')
  const text = 'Here you go: [{"title":"Candlelight: Tribute to Queen","date":"2026-12-05","time":"20:30","venue":"First Presbyterian Church","town":"West Palm Beach","price_from":"44","url":"https://feverup.com/m/1","line":"Queen by candlelight."},' +
    '{"title":"Candlelight: Tribute to Queen","date":"2026-12-05","time":"20:30","url":"https://feverup.com/m/1"},' +
    '{"title":"Past","date":"2026-10-01","url":"https://x"},{"title":"Too far","date":"2027-06-01","url":"https://x"},{"title":"No page","date":"2026-11-01"},{"title":"Bad date","date":"Dec 5","url":"https://x"}]'
  const got = parseWatchEvents(text, { today: TODAY, until: '2027-03-08' })
  assert.deepEqual(got, [{ title: 'Candlelight: Tribute to Queen', date: '2026-12-05', time: '20:30', venue: 'First Presbyterian Church', town: 'West Palm Beach', price_from: 44, url: 'https://feverup.com/m/1', line: 'Queen by candlelight.' }])
  const row = watchOuting(got[0], { id: 'w1', whose: 'us' })
  assert.equal(row.kind, 'couple')
  assert.equal(row.when, '2026-12-05 20:30')
  assert.equal(row.place, 'First Presbyterian Church, West Palm Beach')
  assert.equal(row.why, 'Queen by candlelight. From $44.')
  assert.equal(row.watch_id, 'w1')
  assert.equal(watchOuting(got[0], { id: 'w2', whose: 'family' }).kind, 'family')
})

test('more like this: what it’s known for, and other places — never itself', async () => {
  const { parseLike, likePrompt } = await import('../supabase/functions/_shared/your-list.mjs')
  const got = parseLike('```json\n{"known_for":"House music, dressed up","places":[{"name":"Mary Lou\'s","town":"West Palm Beach"},{"name":"Spazio","town":"West Palm Beach","what":"Upstairs house-music room","alike":"House music, late","source":"clubspazio.com"}]}\n```', 'Mary Lou’s')
  assert.equal(got.knownFor, 'House music, dressed up')
  assert.deepEqual(got.places.map((p) => p.name), ['Spazio'])
  assert.match(likePrompt({ name: 'Mary Lou’s', shelf_label: 'Neighborhood bars', buzz: [] }, { today: TODAY, have: ['Loco'] }), /not these, they know them: Loco/)
})

test('watching: past Broward is too far; a date its page wouldn’t confirm says so', async () => {
  const { watchTooFar, outingItem, UNCHECKED } = await import('../supabase/functions/_shared/your-list.mjs')
  assert.equal(watchTooFar({ venue: 'Cauley Square Historic Village', town: 'Homestead' }), true)
  assert.equal(watchTooFar({ venue: 'Stranahan House', town: 'Fort Lauderdale' }), false)
  assert.equal(watchTooFar({ venue: 'First Presbyterian Church', town: 'West Palm Beach' }), false)
  const it = outingItem({ id: 'x', kind: 'couple', title: 'Candlelight: Queen', when: '2026-12-05 20:30', why: 'Queen by candlelight. From $44.', verify_note: UNCHECKED }, { today: TODAY, watch: { id: 'w', name: 'Candlelight concerts', kind: 'again', whose: 'us' } })
  assert.equal(it.heard, 'Queen by candlelight. From $44. Check the date on its page.')
})

test('watching: one line a show — the first date, the other days as also; two shows stay two', async () => {
  const { collapseWatchDates, watchOuting } = await import('../supabase/functions/_shared/your-list.mjs')
  const e = (title, date, time) => ({ title, date, time, venue: 'Kravis Center', town: 'West Palm Beach', price_from: 25, url: 'https://x', line: null })
  const got = collapseWatchDates([e('THE NUTCRACKER', '2026-12-05', '14:00'), e('Ballet Palm Beach - The Nutcracker', '2026-12-04', '19:00'), e('The Nutcracker', '2026-12-06', '13:00'), e('THE NUTCRACKER', '2026-12-06', '17:00'), e('Candlelight: Tribute to Queen', '2026-12-05', '20:30'), e('Candlelight: Tribute to ABBA', '2027-01-15', '18:15')])
  assert.deepEqual(got.map((g) => [g.title, g.date, g.also]), [
    ['Ballet Palm Beach - The Nutcracker', '2026-12-04', ['2026-12-05', '2026-12-06']],
    ['Candlelight: Tribute to Queen', '2026-12-05', []],
    ['Candlelight: Tribute to ABBA', '2027-01-15', []],
  ])
  assert.equal(watchOuting(got[0], { id: 'w', whose: 'family' }).why, 'From $25. Also Sat Dec 5, Sun Dec 6.')
})

test('watching: a ticket site’s date picker counts as showing the date (Fever: the month’s heading, then "24 sat")', async () => {
  const { pageVerdict } = await import('../supabase/functions/_shared/scout.mjs')
  const text = 'candlelight concerts in west palm beach pick a date october 2026 filters october 2026 24 sat candlelight: a haunted evening of halloween classics first presbyterian church of wpb 6:30 pm from $54.00 candlelight: tribute to dolly parton 8:30 pm november 2026 06 fri candlelight: coldplay & imagine dragons 6:30 pm also on: fri, 22 jan · sat, 20 feb candlelight: tribute to the beatles '.repeat(2)
  const v = (title, when) => pageVerdict({ title, kind: 'couple', when }, text, TODAY, { aheadDays: 150 })
  assert.equal(v('Candlelight: A Haunted Evening of Halloween Classics', '2026-10-24').ok, true)
  assert.equal(v('Candlelight: Coldplay & Imagine Dragons', '2026-11-06').ok, true)
  assert.equal(v('Candlelight: Coldplay & Imagine Dragons', '2027-01-22').ok, true)
  // The 24th isn't under November.
  assert.equal(v('Candlelight: Tribute to the Beatles', '2026-11-24').ok, false)
  // A show on the page, but not that day's.
  assert.equal(v('Candlelight: Tribute to the Beatles', '2026-10-24').ok, false)
  assert.equal(v('Candlelight: Tribute to Dolly Parton', '2026-10-24').ok, true)
})

test('your list: a watch shows its nearby dates first — Broward’s wait', async () => {
  const { yourList } = await import('../supabase/functions/_shared/your-list.mjs')
  const watches = [{ id: 'w1', name: 'Candlelight', kind: 'again', whose: 'us', note: null }]
  const outings = [
    outing('a', 'Candlelight: Classic Rock', '2026-10-16 21:15', { watch_id: 'w1', place: 'The Sanctuary Church FTL, Fort Lauderdale' }),
    outing('b', 'Candlelight: A Haunted Evening', '2026-10-24 18:30', { watch_id: 'w1', place: 'First Presbyterian Church of WPB, West Palm Beach' }),
    outing('c', 'Candlelight: Dolly Parton', '2026-10-24 20:30', { watch_id: 'w1', place: 'First Presbyterian Church of WPB, West Palm Beach' }),
  ]
  const page = yourList({ outings, watches, today: TODAY })
  const shown = [...page.highlights, ...page.more].map((h) => h.title)
  assert.ok(shown.includes('Candlelight: A Haunted Evening') && shown.includes('Candlelight: Dolly Parton'))
  assert.deepEqual(page.later.map((h) => h.title), ['Candlelight: Classic Rock'])
})
