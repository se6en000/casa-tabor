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
  assert.equal(items.filter((i) => i.section === 'schools').length, 4)
  assert.equal(items.find((i) => i.headline === 'Made up'), undefined)
  assert.equal(items.find((i) => i.headline === 'Wrong section'), undefined)
  const flu = items.find((i) => /flu/i.test(i.headline))
  assert.deepEqual([flu.source_date, flu.source_ref, flu.rank], ['2026-10-06', 'm1', 0])
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
