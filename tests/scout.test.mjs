import test from 'node:test'
import assert from 'node:assert/strict'
import { datedFromRecurring, townInReach, dedupeKey, driveMinutes, haversineKm, laneSearchPrompt, newsletterPrompt, pageText, pageVerdict, parseCandidates, restaurantVerdict, SCOUT_LANES, scoutNotes, scoutPicks } from '../supabase/functions/_shared/scout.mjs'

// Jake, Oct 8: the paper suggested SunFest, which isn't happening any more — "they should be legit real things we
// actually can do". Nothing is kept unless its own page backs it up.
const today = '2026-10-08'
const page = (s) => pageText(`<html><body>${s}${' filler'.repeat(60)}</body></html>`)

test('an event is kept only when its own page shows it on a coming date', () => {
  const ev = { kind: 'couple', title: 'Jazz on the Waterfront', when: '2026-10-16 18:30' }
  assert.equal(pageVerdict(ev, page('<h1>Jazz on the Waterfront</h1><p>Friday, October 16, 6:30 PM at the Meyer Amphitheatre</p>'), today).ok, true)
  assert.equal(pageVerdict(ev, page('<h1>Jazz on the Waterfront</h1><p>Friday, Oct. 16</p>'), today).ok, true)
  assert.equal(pageVerdict(ev, page('<h1>Jazz on the Waterfront</h1><p>Friday, November 6</p>'), today).note, 'the page doesn’t show that date')
  assert.equal(pageVerdict(ev, page('<h1>Something else entirely</h1><p>October 16</p>'), today).note, 'its name isn’t on the page')
  assert.equal(pageVerdict({ ...ev, when: '2026-10-01 18:30' }, page('Jazz on the Waterfront October 1'), today).note, 'it’s past')
  assert.equal(pageVerdict({ ...ev, when: '2026-12-01 18:30' }, page('Jazz on the Waterfront December 1'), today).note, 'too far off')
})

test('SunFest: a page that says it’s off is never kept', () => {
  const sunfest = { kind: 'family', title: 'SunFest', when: '2026-10-10 12:00' }
  assert.equal(pageVerdict(sunfest, page('<h1>SunFest</h1><p>After 40 years, SunFest has been cancelled. October 10</p>'), today).ok, false)
  assert.equal(pageVerdict(sunfest, page('<h1>SunFest 2026</h1><p>The festival will not take place this year. Oct 10</p>'), today).ok, false)
  assert.equal(pageVerdict(sunfest, '', today).note, 'the page is empty or blocked')
})

test('a weekly thing names its day on a current page', () => {
  const yoga = { kind: 'fitness', title: 'Sunrise Yoga on the Beach', recurring: 'every Saturday 7:30 AM' }
  assert.equal(pageVerdict(yoga, page('Sunrise Yoga on the Beach — Saturdays at 7:30 am, free. Updated 2026'), today).ok, true)
  assert.equal(pageVerdict(yoga, page('Sunrise Yoga on the Beach — Saturdays at 7:30 am, 2019 season'), today).note, 'the page may be stale')
  assert.equal(pageVerdict(yoga, page('Sunrise Yoga on the Beach — Mondays, 2026'), today).note, 'the page doesn’t name its day')
})

test('a restaurant: open on Google, well rated by enough people, within half an hour; hidden gems and new spots', () => {
  const home = { lat: 26.6946, lng: -80.0556 }
  const place = (over) => ({ businessStatus: 'OPERATIONAL', rating: 4.7, userRatingCount: 220, location: { latitude: 26.71, longitude: -80.06 }, ...over })
  const gem = restaurantVerdict(place({}), home)
  assert.equal(gem.ok, true)
  assert.equal(gem.gem, true)
  assert.ok(gem.minutes <= 10)
  assert.equal(restaurantVerdict(place({ userRatingCount: 4000 }), home).gem, false)
  assert.equal(restaurantVerdict(place({ businessStatus: 'CLOSED_PERMANENTLY' }), home).ok, false)
  assert.equal(restaurantVerdict(place({ rating: 4.2 }), home).ok, false)
  assert.equal(restaurantVerdict(place({ userRatingCount: 20 }), home).ok, false, 'too few to trust, unless it’s new')
  assert.equal(restaurantVerdict(place({ userRatingCount: 20, rating: 4.4 }), home, { fresh: true }).ok, true)
  // Fort Lauderdale is well over half an hour.
  assert.equal(restaurantVerdict(place({ location: { latitude: 26.12, longitude: -80.14 } }), home).ok, false)
  assert.ok(driveMinutes(haversineKm(home, { lat: 26.46, lng: -80.07 })) <= 40, 'Delray Beach is about half an hour')
})

test('the lanes ask for the real thing, as JSON, and the answer is read leniently', () => {
  assert.ok(SCOUT_LANES.some((l) => l.kind === 'fitness' && /pickleball/.test(l.ask)))
  assert.ok(SCOUT_LANES.some((l) => l.kind === 'fitness' && /yoga/.test(l.ask) && /pilates/.test(l.ask)))
  const p = laneSearchPrompt(SCOUT_LANES[0], { today: 'Thursday, October 8, 2026', until: 'Thursday, October 29' })
  assert.match(p, /cancelled/)
  assert.match(p, /palmbeachpost\.com/)
  assert.match(p, /JSON array/)
  const got = parseCandidates('Here you go:\n```json\n[{"title":"Run Club","when":"2026-10-10 07:00","place":"Clematis","url":"https://x.org/run","why":"social 5K"},{"title":""},{"title":"Bad date","when":"Oct 10"}]\n```', 'fitness')
  assert.equal(got.length, 2)
  assert.equal(got[0].kind, 'fitness')
  assert.equal(got[1].when, null)
  assert.deepEqual(parseCandidates('no json here', 'couple'), [])
  assert.match(newsletterPrompt({ from_email: 'news@palmbeachpost.com', subject: 'Things to do', body: 'x' }, today), /2026-10-29/)
})

test('one thing once: the same event from two searches, or a place found twice, merges', () => {
  assert.equal(dedupeKey({ kind: 'couple', title: 'Jazz on the Waterfront!', when: '2026-10-16 18:30' }), dedupeKey({ kind: 'couple', title: 'jazz on the waterfront', when: '2026-10-16 19:00' }))
  assert.notEqual(dedupeKey({ kind: 'couple', title: 'Jazz on the Waterfront', when: '2026-10-16' }), dedupeKey({ kind: 'couple', title: 'Jazz on the Waterfront', when: '2026-10-23' }))
  assert.equal(dedupeKey({ kind: 'couple', title: 'Clematis by Night', when: '2026-10-08 18:00' }), dedupeKey({ kind: 'family', title: 'Clematis by Night', when: '2026-10-08 18:00' }))
  assert.equal(dedupeKey({ kind: 'restaurant', title: 'x', place: 'Planta Queen' }), dedupeKey({ kind: 'restaurant', title: 'y', place: 'PLANTA Queen' }))
})

test('the paper’s picks: couple and fitness first, a family outing on a weekend, never on a busy evening or one said no to', () => {
  const rows = [
    { id: 'a', kind: 'couple', title: 'Wine tasting', when: '2026-10-09 19:00', status: 'new' },
    { id: 'b', kind: 'fitness', title: 'Beach yoga', recurring: 'Saturdays 7:30 AM', status: 'new' },
    { id: 'c', kind: 'restaurant', title: 'Gem', gem: true, status: 'new' },
    { id: 'd', kind: 'family', title: 'Fall festival', when: '2026-10-10 11:00', status: 'new' },
    { id: 'e', kind: 'couple', title: 'Comedy', when: '2026-10-12 20:00', status: 'not_for_us' },
    { id: 'f', kind: 'couple', title: 'Last week’s', when: '2026-10-05 20:00', status: 'new' },
    { id: 'g', kind: 'restaurant', title: 'Offered lately', status: 'offered', offered_on: '2026-10-01' },
  ]
  const picks = scoutPicks(rows, { today, busy: { '2026-10-09': true } })
  const ids = picks.map((p) => p.id)
  assert.ok(!ids.includes('e') && !ids.includes('f') && !ids.includes('g'))
  assert.equal(new Set(picks.map((p) => p.kind)).size, picks.length, 'one of each kind first')
  // The wine tasting is on a busy evening: it falls behind.
  assert.notEqual(ids[0], 'a')
  assert.match(scoutNotes(picks), /\[b\] fitness: Beach yoga · Saturdays 7:30 AM/)
})

test('events within half an hour: a town in reach yes, Miami or Fort Lauderdale no, none named left to the search', () => {
  assert.equal(townInReach('Meyer Amphitheatre, 105 Evernia St, West Palm Beach, FL'), true)
  assert.equal(townInReach('Delray Beach'), true)
  assert.equal(townInReach('Wynwood, Miami, FL'), false)
  assert.equal(townInReach('Las Olas Blvd, Fort Lauderdale'), false)
  assert.equal(townInReach('The Square'), null)
})

// Found on the first real run (Oct 8): a name made of everyday words "found" on the wrong page; dates filed as weekly.
test('a name counts only when its words are together on the page', () => {
  const ev = { kind: 'family', title: 'Thursday Nights in Wellington', recurring: 'every Thursday 6:30 PM' }
  const wrong = page(`Art After Dark at the Norton — every Thursday. ${'Lorem ipsum '.repeat(40)} Late nights downtown. ${'More text '.repeat(40)} Wellington news. 2026`)
  assert.equal(pageVerdict(ev, wrong, today).note, 'its name isn’t on the page')
  assert.equal(pageVerdict(ev, page('Thursday Nights in Wellington — every Thursday, 6:30 PM, 2026'), today).ok, true)
})

test('dates written as "weekly" become a date, checked as one', () => {
  assert.deepEqual(datedFromRecurring({ title: 'Capoeira', when: null, recurring: 'October 9 & 23, 2:00 PM - 3:00 PM' }, today), { title: 'Capoeira', when: '2026-10-09 14:00', recurring: null })
  assert.equal(datedFromRecurring({ title: 'O', when: null, recurring: 'Friday, October 9 (6-11 PM), Saturday, October 10' }, today).when, '2026-10-09 18:00')
  assert.equal(datedFromRecurring({ title: 'Y', when: null, recurring: 'every Saturday 7:30 AM' }, today).recurring, 'every Saturday 7:30 AM')
  assert.equal(datedFromRecurring({ title: 'J', when: null, recurring: 'January 5, 7 PM' }, today).when, '2027-01-05 19:00')
})

test('Alexa’s list: soonest first, a few weekly things and the best places, never a no', async () => {
  const { outingsSection } = await import('../supabase/functions/_shared/scout.mjs')
  const s = outingsSection([
    { kind: 'couple', title: 'Art After Dark', recurring: 'every Friday 5–10 PM', place: 'Norton Museum of Art', free: true, status: 'new' },
    { kind: 'couple', title: 'Oktoberfest', when: '2026-10-09 18:00', place: 'American German Club', status: 'new' },
    { kind: 'restaurant', title: 'Emelina', rating: 4.8, rating_count: 97, gem: true, drive_min: 7, status: 'new' },
    { kind: 'couple', title: 'Comedy night', when: '2026-10-10 20:00', status: 'not_for_us' },
    { kind: 'family', title: 'Old fair', when: '2026-10-01 10:00', status: 'new' },
  ], today)
  assert.match(s, /OUT AND ABOUT/)
  assert.match(s, /Oktoberfest · 2026-10-09 18:00/)
  assert.match(s, /Emelina · ~7 min · 4\.8★ \(97\) · hidden gem/)
  assert.doesNotMatch(s, /Comedy night|Old fair/)
  assert.ok(s.indexOf('Oktoberfest') < s.indexOf('Art After Dark'), 'dated first')
  assert.equal(outingsSection([], today), null)
})

// Canvas 72B, the paper's second page: the two best of each kind.
test('Out & about: two of each kind, soonest and best first, never a no or a past one', async () => {
  const { outAndAbout } = await import('../supabase/functions/_shared/scout.mjs')
  const rows = [
    { id: 'c1', kind: 'couple', title: 'Tasting', when: '2026-10-16 18:00', status: 'new' },
    { id: 'c2', kind: 'couple', title: 'Art After Dark', recurring: 'Fridays', status: 'new' },
    { id: 'c3', kind: 'couple', title: 'Comedy', when: '2026-10-09 20:00', status: 'not_for_us' },
    { id: 'c4', kind: 'couple', title: 'Jazz', when: '2026-10-09 19:00', status: 'offered', offered_on: today },
    { id: 'f1', kind: 'family', title: 'Old', when: '2026-10-01 10:00', status: 'new' },
    { id: 'f2', kind: 'family', title: 'Pumpkin Fest', when: '2026-10-10 11:00', status: 'new' },
    { id: 'r1', kind: 'restaurant', title: 'Gem', gem: true, status: 'new' },
    { id: 'r2', kind: 'restaurant', title: 'Plain', status: 'new' },
    { id: 'r3', kind: 'restaurant', title: 'Saved', status: 'saved' },
  ]
  const o = outAndAbout(rows, { today })
  assert.deepEqual(o.couple.map((x) => x.id), ['c4', 'c1'])
  assert.deepEqual(o.family.map((x) => x.id), ['f2'])
  assert.deepEqual(o.fitness, [])
  assert.deepEqual(o.restaurant.map((x) => x.id), ['r3', 'r1'])
})

// Jake, Oct 8: "on the front page include both the you may have forgotten & This Weekend (pick a couples thing with a
// high percentage of impact — a highlight from the Out and about)".
test('This weekend: the best thing for the two of them Friday to Sunday, else the best this week', async () => {
  const { weekendHighlight } = await import('../supabase/functions/_shared/scout.mjs')
  // Thursday, Oct 8: the weekend is Fri 9 – Sun 11.
  const rows = [
    { id: 'tue', kind: 'couple', title: 'Tuesday wine', when: '2026-10-13 19:00', status: 'new' },
    { id: 'sat', kind: 'couple', title: 'Jazz', when: '2026-10-10 19:00', status: 'new' },
    { id: 'fam', kind: 'family', title: 'Pumpkin Fest', when: '2026-10-10 11:00', status: 'new' },
    { id: 'fri', kind: 'couple', title: 'Art After Dark', recurring: 'Fridays 5–8 PM', status: 'new' },
    { id: 'no', kind: 'couple', title: 'Comedy', when: '2026-10-09 20:00', status: 'not_for_us' },
  ]
  const h = weekendHighlight(rows, { today })
  assert.equal(h.label, 'This weekend')
  assert.equal(h.outing.id, 'sat') // a date beats a weekly one
  // A busy Saturday evening: the Friday one instead.
  assert.equal(weekendHighlight(rows, { today, busy: { '2026-10-10': true } }).outing.id, 'fri')
  // Nothing on the weekend: the week's best, said so.
  const week = weekendHighlight([rows[0]], { today })
  assert.deepEqual([week.label, week.outing.id], ['This week', 'tue'])
  // On a Saturday, the weekend is this one.
  assert.equal(weekendHighlight(rows, { today: '2026-10-10' }).outing.id, 'sat')
  assert.equal(weekendHighlight([], { today }), null)
})

test('an outing’s when, the way the paper says it', async () => {
  const { outingWhen } = await import('../supabase/functions/_shared/scout.mjs')
  assert.equal(outingWhen({ when: '2026-10-16 18:00' }), 'Fri, Oct 16 · 6 PM')
  assert.equal(outingWhen({ when: '2026-10-10 11:30' }), 'Sat, Oct 10 · 11:30 AM')
  assert.equal(outingWhen({ when: '2026-10-10' }), 'Sat, Oct 10')
  assert.equal(outingWhen({ recurring: 'Thursdays 6:30 PM' }), 'Thursdays 6:30 PM')
  assert.equal(outingWhen({ kind: 'restaurant', drive_min: 7 }), null)
})

// Canvas 72C, Around town (Jake: "family news with outside news"): the week's emails from the schools, the city and the
// papers, boiled down to what reaches this family — each line traced to a real email.
test('Around town: the news prompt carries each email with its id and the family', async () => {
  const { townNewsPrompt } = await import('../supabase/functions/_shared/scout.mjs')
  const p = townNewsPrompt([{ id: 'm1', from: 'Palm Beach Public <news@palmbeachschools.org>', subject: 'Flu shots Oct 28', received: '2026-10-06', body: 'Free flu shots at the clinic' }], { today, family: 'Jake and Kelly; Liv, Emme and Owen' })
  assert.match(p, /\[m1\]/)
  assert.match(p, /Flu shots Oct 28/)
  assert.match(p, /Liv, Emme and Owen/)
  assert.match(p, /schools.*city.*papers/s)
})

test('Around town: only items from a real email, in a known section, four a section at most', async () => {
  const { parseTownNews, townNewsPage } = await import('../supabase/functions/_shared/scout.mjs')
  const refs = new Map([['m1', { received: '2026-10-06', from: 'news@palmbeachschools.org' }], ['m2', { received: '2026-10-01', from: 'updates@wpb.org' }]])
  const text = 'Here: ' + JSON.stringify([
    { section: 'schools', headline: 'Free flu shots at school, Oct 28', line: 'Emme and Owen can get theirs there.', source: 'Palm Beach Public', ref: 'm1' },
    { section: 'city', headline: 'Referendum town hall moved', line: 'New date.', source: 'City of West Palm Beach', ref: 'm2' },
    { section: 'city', headline: 'Made up', line: 'No such email.', source: 'Somewhere', ref: 'm9' },
    { section: 'sports', headline: 'Wrong section', line: 'x', source: 'x', ref: 'm1' },
    { section: 'schools', headline: 'free flu shots at school, oct 28', line: 'The same again.', source: 'Palm Beach Public', ref: 'm1' },
    ...Array.from({ length: 6 }, (_, i) => ({ section: 'schools', headline: `School item ${i}`, line: 'x', source: 'Palm Beach Public', ref: 'm1' })),
  ])
  const items = parseTownNews(text, { refs, today })
  // Eight a section now (Oct 8, Jake: "fit up all the available spots"): the one said twice is left out.
  assert.equal(items.filter((i) => i.section === 'schools').length, 7)
  assert.equal(items.find((i) => i.headline === 'Made up'), undefined)
  assert.equal(items.find((i) => i.headline === 'Wrong section'), undefined)
  const flu = items.find((i) => /flu/i.test(i.headline))
  assert.deepEqual([flu.source_date, flu.source_ref, flu.rank, flu.on_date], ['2026-10-06', 'm1', 0, null])
  const page = townNewsPage([...items].reverse())
  assert.equal(page.schools[0].headline, 'Free flu shots at school, Oct 28')
  assert.equal(page.city.length, 1)
  assert.deepEqual(page.papers, [])
  assert.deepEqual(parseTownNews('no json', { refs, today }), [])
})

// The first live run (Oct 8) kept "Downtown Master Plan update, October 6" and put a school's concert note under the papers.
test('Around town: a line whose dates are all past is left out; the sender decides the section', async () => {
  const { parseTownNews } = await import('../supabase/functions/_shared/scout.mjs')
  const refs = new Map([['s', { received: '2026-10-02', from: 'Palm Beach Public <news@palmbeachschools.org>' }], ['c', { received: '2026-10-01', from: 'updates@wpb.org' }], ['p', { received: '2026-10-07', from: 'newsletters@palmbeachpost.com' }]])
  const items = parseTownNews(JSON.stringify([
    { section: 'city', headline: 'Downtown Master Plan update October 6', line: 'At City Hall on October 6, 2026.', source: 'City', ref: 'c' },
    { section: 'city', headline: 'GreenMarket opens', line: 'From October 3 to April 25 on Saturdays.', source: 'City', ref: 'c' },
    { section: 'papers', headline: 'Glazer Hall concerts for kids', line: 'On October 10.', source: 'Palm Beach Public', ref: 's' },
    { section: 'schools', headline: 'New restaurant row', line: 'Opening this month.', source: 'Post', ref: 'p' },
  ]), { refs, today })
  assert.deepEqual(items.map((i) => [i.headline, i.section]), [['GreenMarket opens', 'city'], ['Glazer Hall concerts for kids', 'schools'], ['New restaurant row', 'papers']])
})

// The paper's "Phone" (canvas 72B): an event opens its own page; a restaurant opens in Google Maps.
test('an outing’s link for the phone: its page, or the place on Google Maps', async () => {
  const { outingLink } = await import('../supabase/functions/_shared/scout.mjs')
  assert.equal(outingLink({ kind: 'couple', title: 'Jazz', url: 'https://example.org/jazz' }), 'https://example.org/jazz')
  assert.equal(outingLink({ kind: 'restaurant', title: 'Celona', address: '1 Clematis St, West Palm Beach', url: 'https://celona.com', google_place_id: 'abc' }),
    'https://www.google.com/maps/search/?api=1&query=Celona%201%20Clematis%20St%2C%20West%20Palm%20Beach&query_place_id=abc')
  assert.equal(outingLink({ kind: 'family', title: 'Fair', place: 'Fairgrounds' }), 'https://www.google.com/maps/search/?api=1&query=Fair%20Fairgrounds')
})

// Jake, Oct 8: "do the calendar feeds" — local live music, comedy and trivia, read straight from the calendars' own
// markup (no AI): Weekend Broward's nightly Palm Beach gigs, South Florida Live Music's gig list, Great Big Trivia's games.
test('calendars: Great Big Trivia’s weekly games, from its structured data', async () => {
  const { parseTriviaSchedule } = await import('../supabase/functions/_shared/scout.mjs')
  const ld = { '@graph': [
    { '@type': 'EventSeries', name: 'Live Trivia at Newport Diner', description: 'Free weekly live trivia night with DJ host and real bar prizes.', eventSchedule: { byDay: 'https://schema.org/Thursday', startTime: '19:00', endTime: '21:00' }, location: { name: 'Newport Diner', address: { streetAddress: '1 Clematis St', addressLocality: 'West Palm Beach' } }, isAccessibleForFree: true },
    { '@type': 'FAQPage' },
  ] }
  const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
  const [t] = parseTriviaSchedule(html, 'https://www.greatbigtrivia.com/play/palm-beach-county')
  assert.equal(t.kind, 'trivia')
  assert.equal(t.title, 'Live Trivia')
  assert.equal(t.place, 'Newport Diner')
  assert.equal(t.recurring, 'Thursdays 7–9 PM')
  assert.equal(t.address, '1 Clematis St, West Palm Beach')
  assert.equal(t.free, true)
})

test('calendars: Weekend Broward’s gigs — the act, the venue, the time and its own link', async () => {
  const { parseWeekendBroward } = await import('../supabase/functions/_shared/scout.mjs')
  const html = `<li class="simcal-event" itemscope itemtype="http://schema.org/Event"><span class="simcal-event-title" itemprop="name">The Goodnicks at Centennial Square &amp; Great Lawn in West Palm Beach +*</span>
    <span class="simcal-event-start" itemprop="startDate" content="2026-10-08T18:00:00-04:00">October 8</span>
    <span itemprop="location"><meta itemprop="address" content="Nancy M. Graham Centennial Square, 150 N Clematis St, West Palm Beach, FL 33401, USA" /></span>
    <div class="simcal-event-description" itemprop="description"><h2><span>Clematis by Night</span></h2><p>Every Thursday.</p><a href="https://www.wpb.org/clematis-by-night">x</a></div></li>`
  const [g] = parseWeekendBroward(html)
  assert.deepEqual([g.kind, g.title, g.when, g.place], ['music', 'The Goodnicks', '2026-10-08 18:00', 'Nancy M. Graham Centennial Square'])
  assert.equal(g.address, '150 N Clematis St, West Palm Beach, FL 33401')
  assert.equal(g.url, 'https://www.wpb.org/clematis-by-night')
  assert.equal(g.why, 'Clematis by Night')
})

test('calendars: South Florida Live Music’s gigs — dated, tonight or weekly; comedy is comedy', async () => {
  const { parseSflmGigs } = await import('../supabase/functions/_shared/scout.mjs')
  const gig = (o) => JSON.stringify({ slug: o.slug, artist: o.artist, venue: o.venue, genre: o.genre, genreCls: 'x', time: o.time, cover: o.cover, lat: '26.346648', lng: '-80.084623', detailUrl: `https://southfloridalivemusic.com/gig/?gig=${o.slug}` })
  const html = `<script>var gigs = [${[
    gig({ slug: 'a', artist: 'Chicago Transit Canada', venue: 'The Funky Biscuit', genre: 'CLASSIC ROCK', time: 'Wed, Oct 21 · 9 PM', cover: 'Ticketed' }),
    gig({ slug: 'b', artist: 'Rotating Live Music at Bamboo Room', venue: 'Bamboo Room', genre: 'ROCK', time: 'Every Sun, Wed & Sat', cover: 'Free' }),
    gig({ slug: 'c', artist: 'Celtic Thursday', venue: 'Luna Star Cafe', genre: 'FOLK', time: 'Tonight', cover: 'No cover' }),
    gig({ slug: 'd', artist: 'Nate Bargatze', venue: 'Kravis Center', genre: 'COMEDY', time: 'Sat, Jan 9 · 7:30 PM', cover: 'Ticketed' }),
  ].join(',')}]</script>`
  const [a, b, c, d] = parseSflmGigs(html, '2026-10-08')
  assert.deepEqual([a.kind, a.title, a.place, a.when, a.ticketed], ['music', 'Chicago Transit Canada', 'The Funky Biscuit', '2026-10-21 21:00', true])
  assert.deepEqual([b.when, b.recurring], [null, 'Every Sun, Wed & Sat'])
  assert.equal(c.when, '2026-10-08')
  assert.deepEqual([d.kind, d.when], ['comedy', '2027-01-09 19:30'])
  assert.deepEqual(a.at, { lat: 26.346648, lng: -80.084623 })
})

// Local first: everyday things within half an hour; a ticketed show (a touring band, a comedian) up to an hour.
test('calendars: within half an hour, or an hour for a ticketed show', async () => {
  const { calendarReach } = await import('../supabase/functions/_shared/scout.mjs')
  const home = { lat: 26.6779, lng: -80.059 }
  assert.equal(calendarReach({ at: { lat: 26.70, lng: -80.06 } }, home).ok, true)
  assert.equal(calendarReach({ at: { lat: 26.3466, lng: -80.0846 } }, home).ok, false) // Boca bar gig, ~40 min
  assert.equal(calendarReach({ at: { lat: 26.3466, lng: -80.0846 }, ticketed: true }, home).ok, true)
  assert.equal(calendarReach({ at: { lat: 25.79, lng: -80.19 }, ticketed: true }, home).ok, false) // Miami
  assert.equal(calendarReach({ address: 'Rudy’s Pub, Lake Worth, FL' }, home).ok, true)
  assert.equal(calendarReach({ address: 'Tin Roof, 8 E Atlantic Ave, Delray Beach, FL' }, home).ok, true)
  assert.equal(calendarReach({ address: "Crazy Uncle Mike's, 6450 N Federal Hwy, Boca Raton, FL" }, home).ok, false)
})

// Jake, Oct 8: "the last thing I want to hear about is typical tourist stuff / referral bait".
test('no tourist stuff or referral bait', async () => {
  const { isBait } = await import('../supabase/functions/_shared/scout.mjs')
  for (const t of ['Sunset Sightseeing Boat Tour', 'Palm Beach Trolley Tour', 'Airboat Adventure', 'Win 2 VIP tickets — enter now', 'Top 10 things to do in Palm Beach', 'Use promo code PALM20']) assert.equal(isBait({ title: t }), true, t)
  assert.equal(isBait({ title: 'Clematis by Night', why: 'free waterfront concert' }), false)
  assert.equal(isBait({ title: 'Live Trivia', place: 'Newport Diner' }), false)
  assert.equal(isBait({ title: 'Jazz night', why: 'Sponsored by Visit Florida' }), true)
})

// Jake, Oct 8: "we will need some significant deduping … a lot of these sources are going to have the same information".
test('the same thing from two sources is one: by its name, its day and its place', async () => {
  const { sameOuting, foldIn } = await import('../supabase/functions/_shared/scout.mjs')
  const wb = { kind: 'music', title: 'The Goodnicks', when: '2026-10-08 18:00', place: 'Nancy M. Graham Centennial Square', address: '150 N Clematis St, West Palm Beach', url: 'https://www.wpb.org/clematis-by-night', verify_note: 'on Weekend Broward' }
  const sflm = { kind: 'music', title: 'Goodnicks', when: '2026-10-08 18:00', place: 'Centennial Square', drive_min: 6, verify_note: 'on South Florida Live Music' }
  const clematis = { kind: 'couple', title: 'Clematis by Night: The Goodnicks', when: '2026-10-08 18:00', place: 'West Palm Beach Waterfront', verify_note: 'its page shows it' }
  assert.equal(sameOuting(wb, sflm), true)
  assert.equal(sameOuting(wb, clematis), true) // the newsletter's / the search's write-up of the same night
  assert.equal(sameOuting(wb, { ...sflm, when: '2026-10-15 18:00' }), false) // next week's is another night
  assert.equal(sameOuting(wb, { ...sflm, title: 'Spider Cherry' }), false) // another act
  // A weekly one and that week's dated listing at the same place: one.
  const weekly = { kind: 'music', title: 'Rotating Live Music', recurring: 'Every Sun, Wed & Sat', place: 'Bamboo Room' }
  assert.equal(sameOuting(weekly, { kind: 'music', title: 'Live music', when: '2026-10-10 20:00', place: 'The Bamboo Room' }), true) // a Saturday
  assert.equal(sameOuting(weekly, { kind: 'music', title: 'Live music', when: '2026-10-09 20:00', place: 'The Bamboo Room' }), false) // a Friday
  // A restaurant never merges with an event there.
  assert.equal(sameOuting({ kind: 'restaurant', title: 'Celona', place: 'Celona' }, { kind: 'couple', title: 'Gin tasting at Celona', when: '2026-10-09 19:00', place: 'Celona' }), false)
  // Folded into what's kept: the kept row's key and answer stay; the best details from each; where it was seen.
  const kept = [{ ...clematis, dedupe_key: 'e:clematis-night:2026-10-08', status: 'saved' }]
  const rows = foldIn([wb, sflm], kept)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].dedupe_key, 'e:clematis-night:2026-10-08')
  assert.equal(rows[0].status, 'saved')
  assert.equal(rows[0].address, '150 N Clematis St, West Palm Beach')
  assert.equal(rows[0].drive_min, 6)
  assert.match(rows[0].verify_note, /its page shows it.*Weekend Broward.*South Florida Live Music/)
  // Said no to: it stays gone, from any source.
  assert.deepEqual(foldIn([wb], [{ ...clematis, dedupe_key: 'k', status: 'not_for_us' }]), [])
})

// Alexa: "who's playing tonight?", "any comedy this weekend?", "where's trivia tonight?" — from the calendars.
test('Alexa’s live music, comedy and trivia: tonight first, the week, the weekly ones by day; kept apart from the rest', async () => {
  const { tonightSection, outingsSection, scoutPicks } = await import('../supabase/functions/_shared/scout.mjs')
  const rows = [
    { kind: 'music', title: 'The Goodnicks', when: '2026-10-08 18:00', place: 'Centennial Square', why: 'Clematis by Night', status: 'new' },
    { kind: 'music', title: 'Edwin McCain', when: '2026-10-10 19:00', place: 'The Funky Biscuit', why: 'rock · ticketed', status: 'new' },
    { kind: 'comedy', title: 'Nate Bargatze', when: '2026-10-11 19:30', place: 'Kravis Center', status: 'new' },
    { kind: 'trivia', title: 'Live Trivia', recurring: 'Thursdays 7–9 PM', place: 'Newport Diner', status: 'new' },
    { kind: 'music', title: 'Old gig', when: '2026-10-01 20:00', place: 'X', status: 'new' },
    { kind: 'music', title: 'Far off', when: '2026-11-30 20:00', place: 'Y', status: 'new' },
    { kind: 'couple', title: 'Art After Dark', recurring: 'Fridays 5–8 PM', place: 'Norton', status: 'new' },
    { kind: 'couple', title: 'Clematis by Night: Uncle Morty', when: '2026-10-08 18:00', place: 'Waterfront', status: 'new', verify_note: 'its page shows it · on Weekend Broward' },
  ]
  const s = tonightSection(rows, today)
  assert.match(s, /^LIVE MUSIC, COMEDY & TRIVIA/)
  assert.match(s, /Tonight[^\n]*\n- 6 PM · The Goodnicks at Centennial Square/)
  assert.match(s, /Sat Oct 10 · 7 PM · Edwin McCain at The Funky Biscuit/)
  assert.match(s, /comedy: Sun Oct 11 · 7:30 PM · Nate Bargatze at Kravis Center/)
  assert.match(s, /Thursdays 7–9 PM · Live Trivia at Newport Diner/)
  assert.match(s, /6 PM · Clematis by Night: Uncle Morty at Waterfront/) // a calendar listed it, kept as the Scout's own
  assert.doesNotMatch(s, /Old gig|Far off|Art After Dark/)
  // The rest of the Scout's list leaves them to this section; the paper's picks too.
  assert.doesNotMatch(outingsSection(rows, today) ?? '', /Goodnicks|Live Trivia/)
  assert.ok(scoutPicks(rows, { today, n: 5 }).every((o) => !['music', 'comedy', 'trivia'].includes(o.kind)))
  assert.equal(tonightSection([], today), null)
})

// The first calendar run (Oct 8): "Live Trivia, Mondays" at PapiChulo and at Uncle Mick's became one — the key had no
// place. Two places are two things; and karaoke and DJ nights aren't the live music asked for.
test('the same name on the same night at two places is two things; karaoke and DJ nights are left out', async () => {
  const { dedupeKey, foldIn, notLiveMusic } = await import('../supabase/functions/_shared/scout.mjs')
  const a = { kind: 'trivia', title: 'Live Trivia', recurring: 'Mondays 7–9 PM', place: 'PapiChulo Tacos' }
  const b = { kind: 'trivia', title: 'Live Trivia', recurring: 'Mondays 8–10 PM', place: "Uncle Mick's Bar & Grill" }
  assert.notEqual(dedupeKey(a), dedupeKey(b))
  assert.equal(foldIn([a, b], []).length, 2)
  assert.equal(notLiveMusic({ kind: 'music', title: 'Weekly Karaoke', place: 'Foster’s Shak' }), true)
  assert.equal(notLiveMusic({ kind: 'music', title: 'House and Techno Weekends', why: 'house, techno · free' }), true)
  assert.equal(notLiveMusic({ kind: 'music', title: 'Sunset DJ Sets at Serena Rooftop' }), true)
  assert.equal(notLiveMusic({ kind: 'music', title: 'SnapHook', why: null }), false)
  assert.equal(notLiveMusic({ kind: 'trivia', title: 'Music Bingo' }), false)
})

// Jake, Oct 8: "can you make the trivia concerts, etc just part of the out and about?" — For the two of you: its best
// evening out and the best of the calendars' gigs (a band, a comedian, trivia) — two of either when there's only one kind.
test('Out & about: For the two of you mixes the best evening out with the best gig, comedy show or trivia night', async () => {
  const { outAndAbout } = await import('../supabase/functions/_shared/scout.mjs')
  const rows = [
    { id: 'c1', kind: 'couple', title: 'Wine tasting', when: '2026-10-09 19:00', status: 'new' },
    { id: 'c2', kind: 'couple', title: 'Art After Dark', recurring: 'Fridays', status: 'new' },
    { id: 'm1', kind: 'music', title: 'The Goodnicks', when: '2026-10-08 18:00', place: 'Centennial Square', status: 'new' },
    { id: 'm2', kind: 'music', title: 'Far-off band', when: '2026-10-21 21:00', status: 'new' },
    { id: 't1', kind: 'trivia', title: 'Live Trivia', recurring: 'Thursdays 7–9 PM', place: 'Newport Diner', status: 'new' },
  ]
  const o = outAndAbout(rows, { today })
  assert.deepEqual(o.couple.map((x) => x.id), ['c1', 'm1'])
  // Only gigs: two of them.
  assert.deepEqual(outAndAbout(rows.filter((r) => r.kind !== 'couple'), { today }).couple.map((x) => x.id), ['m1', 't1'])
  // No gigs: two evenings out, as before.
  assert.deepEqual(outAndAbout(rows.filter((r) => r.kind === 'couple'), { today }).couple.map((x) => x.id), ['c1', 'c2'])
})

// Jake, Oct 8: "im not seeing much.... can you rethink how you organize out and about … fit up all the available spots
// even have a scroll … its not just about today, things that look cool a couple weeks out are good to know too for
// planning". Out & about by when: tonight and the weekend by day, next week, further out, every week, and places.
test('Out & about by when: tonight & the weekend by day, next week, further out, every week by day, places', async () => {
  const { outAndAboutPlan } = await import('../supabase/functions/_shared/scout.mjs')
  const g = (id, kind, when, extra = {}) => ({ id, kind, title: id, when, recurring: null, status: 'new', ...extra })
  const rows = [
    g('tonight-band', 'music', '2026-10-08 20:00'), g('open-mic', 'comedy', '2026-10-08 20:00'),
    ...Array.from({ length: 8 }, (_, i) => g(`fri-band-${i}`, 'music', `2026-10-09 ${String(17 + (i % 5)).padStart(2, '0')}:00`)),
    g('pumpkin', 'family', '2026-10-10 11:00'), g('jazz', 'couple', '2026-10-10 19:00'),
    g('tue-wine', 'couple', '2026-10-13 19:00'), g('harbourfest', 'family', '2026-10-16 16:00'),
    g('seagulls', 'music', '2026-11-06 19:30', { free: false }), g('fright', 'family', '2026-10-29 18:00'),
    g('way-off', 'music', '2027-01-20 20:00'),
    g('trivia-mon', 'trivia', null, { recurring: 'Mondays 7–9 PM' }), g('yoga', 'fitness', null, { recurring: 'every Thursday 6:30 PM' }),
    g('art', 'couple', null, { recurring: 'every Friday 5–8 PM' }), g('market', 'family', null, { recurring: 'every Sunday 8 AM–1 PM' }),
    g('celona', 'restaurant', null, { gem: true, rating: 4.8 }), g('andino', 'restaurant', null, { rating: 5 }),
    g('gone', 'couple', '2026-10-12 19:00', { status: 'not_for_us' }), g('past', 'music', '2026-10-07 20:00'),
  ]
  const p = outAndAboutPlan(rows, { today })
  // Thursday: tonight, Fri, Sat, Sun.
  assert.deepEqual(p.weekend.map((d) => d.label), ['Tonight', 'Friday', 'Saturday', 'Sunday'])
  assert.deepEqual(p.weekend[0].items.map((o) => o.id), ['open-mic', 'tonight-band'])
  // A busy night's bands: the first few, and how many more.
  assert.equal(p.weekend[1].items.length, 5)
  assert.equal(p.weekend[1].more, 3)
  // What's for the two of you or the family leads its day.
  assert.deepEqual(p.weekend[2].items.map((o) => o.id), ['pumpkin', 'jazz'])
  assert.deepEqual(p.weekend[3].items, [])
  assert.deepEqual(p.nextWeek.map((o) => o.id), ['tue-wine', 'harbourfest'])
  // Further out: a few weeks, worth planning for (not next year).
  assert.deepEqual(p.later.map((o) => o.id), ['fright', 'seagulls'])
  // Every week, by its first day.
  assert.deepEqual(p.weekly.map((o) => o.id), ['trivia-mon', 'yoga', 'art', 'market'])
  assert.deepEqual(p.places.map((o) => o.id), ['celona', 'andino'])
  assert.equal(p.count, 2 + 8 + 2 + 2 + 2 + 4 + 2)
})

// The first run (Oct 8): Clematis by Night came back from two searches as two rows (an evening for two, and the family's).
test('what was kept twice before the fold is found and the later one put away', async () => {
  const { keptTwice } = await import('../supabase/functions/_shared/scout.mjs')
  const rows = [
    { id: 'a', kind: 'couple', title: 'Clematis by Night: The Goodnicks', when: '2026-10-08 18:00', place: 'Waterfront Commons', status: 'new', created_at: '2026-10-08T01:00:00Z' },
    { id: 'b', kind: 'family', title: 'Clematis by Night: The Goodnicks', when: '2026-10-08 18:00', place: 'Centennial Square & Great Lawn', status: 'saved', created_at: '2026-10-08T01:05:00Z' },
    { id: 'c', kind: 'music', title: 'Spider Cherry', when: '2026-10-08 19:00', place: 'The Bungalow', status: 'new', created_at: '2026-10-08T01:06:00Z' },
  ]
  // The saved one stays (what the family said of it), the other goes.
  assert.deepEqual(keptTwice(rows), ['a'])
})

// Jake, Oct 8 (Around town too): "fit up all the available spots … things a couple weeks out are good to know too for
// planning" — eight a section, and each line's own date, so the page can lead with the dates to know.
test('Around town: up to eight a section, each with its own date; the dates to know, soonest first', async () => {
  const { parseTownNews, townNewsPage } = await import('../supabase/functions/_shared/scout.mjs')
  const refs = new Map([['m1', { received: '2026-10-06', from: 'news@palmbeachschools.org' }]])
  const items = parseTownNews(JSON.stringify([
    ...Array.from({ length: 10 }, (_, i) => ({ section: 'schools', headline: `Item ${i}`, line: 'x', source: 'Palm Beach Public', ref: 'm1', date: i === 2 ? '2026-10-28' : i === 5 ? '2026-10-16' : null })),
    { section: 'schools', headline: 'Bad date', line: 'x', source: 'PBP', ref: 'm1', date: 'soon' },
  ]), { refs, today })
  assert.equal(items.filter((i) => i.section === 'schools').length, 8)
  assert.equal(items.find((i) => i.headline === 'Item 2').on_date, '2026-10-28')
  assert.equal(items.find((i) => i.headline === 'Item 0').on_date, null)
  const page = townNewsPage(items, today)
  assert.deepEqual(page.dates.map((i) => i.headline), ['Item 5', 'Item 2'])
})

test('tonight drops what has already started (an hour in)', async () => {
  const { outAndAboutPlan } = await import('../supabase/functions/_shared/scout.mjs')
  const rows = [{ id: 'early', kind: 'music', title: 'early', when: '2026-10-08 17:00', status: 'new' }, { id: 'late', kind: 'music', title: 'late', when: '2026-10-08 21:00', status: 'new' }, { id: 'open', kind: 'music', title: 'open', when: '2026-10-08', status: 'new' }]
  assert.deepEqual(outAndAboutPlan(rows, { today, nowTime: '19:30' }).weekend[0].items.map((o) => o.id), ['open', 'late'])
})
