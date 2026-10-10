import test from 'node:test'
import assert from 'node:assert/strict'

// A place, the whole story (canvas 90A–B; Jake, Oct 10): Google's facts in plain words, the web's answers only with a
// page behind them, "for you two" only when whole.

const HOURS = ['Monday: Closed', 'Tuesday: Closed', 'Wednesday: 5:00 – 10:00 PM', 'Thursday: 5:00 – 10:00 PM', 'Friday: 5:00 – 10:00 PM', 'Saturday: 5:00 – 10:00 PM', 'Sunday: Closed']

test('dossier: the week in a line, today open or closed', async () => {
  const { hoursLine, todayHours } = await import('../supabase/functions/_shared/place-dossier.mjs')
  assert.equal(hoursLine(HOURS), 'Wed–Sat 5–10 PM · closed Sun–Tue')
  assert.equal(hoursLine(['Monday: 11:00 AM – 3:00 PM', 'Tuesday: 11:00 AM – 3:00 PM', 'Wednesday: 11:00 AM – 3:00 PM', 'Thursday: 11:00 AM – 3:00 PM', 'Friday: 11:00 AM – 11:00 PM', 'Saturday: 11:00 AM – 11:00 PM', 'Sunday: Closed']), 'Mon–Thu 11 AM–3 PM · Fri–Sat 11 AM–11 PM · closed Sun')
  assert.equal(hoursLine(null), null)
  assert.deepEqual(todayHours(HOURS, '2026-10-10'), { open: true, text: 'Open today, 5–10 PM' })
  assert.deepEqual(todayHours(HOURS, '2026-10-11'), { open: false, text: 'Closed today' })
})

test('dossier: Google in plain words — the price, what it has, parking, the reviews with who wrote them', async () => {
  const { googleFacts, reviewExcerpt } = await import('../supabase/functions/_shared/place-dossier.mjs')
  const g = googleFacts({
    displayName: { text: 'J&C Oyster' }, priceLevel: 'PRICE_LEVEL_MODERATE', priceRange: { startPrice: { units: '30' }, endPrice: { units: '90' } },
    outdoorSeating: true, reservable: true, liveMusic: false, servesCocktails: true, parkingOptions: { paidStreetParking: true, paidGarageParking: true },
    reviews: [{ rating: 5, relativePublishTimeDescription: '2 months ago', text: { text: 'Great oysters.' }, authorAttribution: { displayName: 'Niti M', uri: 'https://maps.google.com/x' } }, { rating: 4, text: { text: '' } }],
    photos: [{ name: 'places/x/photos/1', widthPx: 100, heightPx: 80, authorAttributions: [{ displayName: 'Ashley' }] }],
  })
  assert.equal(g.price, '$$ · $30–$90 a person')
  assert.deepEqual(g.has, ['outdoor seating', 'takes reservations'])
  assert.deepEqual(g.serves, ['cocktails'])
  assert.equal(g.parking, 'paid street, paid garage')
  assert.equal(g.reviews.length, 1)
  assert.equal(g.reviews[0].by, 'Niti M')
  assert.equal(g.photos[0].by, 'Ashley')
  assert.equal(reviewExcerpt('Short.'), 'Short.')
  const long = 'The food and the team here are amazing. Definitely the perfect blend of seafood forward and refined casual dining. Good for a mid-week treat or a romantic date night. Must try!'
  assert.equal(reviewExcerpt(long, 120), 'The food and the team here are amazing. Definitely the perfect blend of seafood forward and refined casual dining.')
})

test('dossier: the web’s answers — only with a page, "Null" is nothing, deals with their days', async () => {
  const { parseDossier, sourceWord } = await import('../supabase/functions/_shared/place-dossier.mjs')
  const d = parseDossier(`Here: ${JSON.stringify({
    dress: { text: 'Smart casual.', url: 'https://g.co/r', as_of: '2024-08' },
    parking: { text: 'Null', url: null },
    noise: { text: 'Loud on Fridays.' },
    busy: { text: 'Open for dinner Wednesday through Saturday from 5 PM to 10 PM.', url: 'https://x.com' },
    deals: [{ text: 'Happy hour at the bar: oysters and cocktails.', when: 'Wed–Sat 5–7 PM', url: 'https://lmgfl.com/x', as_of: '2024-05' }, { text: '' }],
    order: { items: ['Thai crab curry', '', 'Pork belly'], url: 'https://x.com' },
    heads_up: [{ text: 'A 20% gratuity is added.', url: 'https://miamichecklist.substack.com/p/x', as_of: '2024-04' }],
  })}`, [])
  assert.equal(d.dress.text, 'Smart casual.')
  assert.equal(d.parking, null)
  assert.equal(d.noise, null) // no page behind it
  assert.equal(d.busy, null) // its hours aren't how busy it gets
  assert.equal(d.deals.length, 1)
  assert.equal(d.deals[0].when, 'Wed–Sat 5–7 PM')
  assert.deepEqual(d.order.items, ['Thai crab curry', 'Pork belly'])
  assert.equal(sourceWord(d.heads_up[0]), 'miamichecklist.substack.com · 2024-04')
  assert.equal(parseDossier('no json'), null)
})

test('dossier: for you two — their loves against the facts; only whole lines; the prompt never asks it to invent', async () => {
  const { forYouPrompt, parseForYou } = await import('../supabase/functions/_shared/place-dossier.mjs')
  const p = forYouPrompt({ place: { name: 'J&C Oyster' }, google: { type: 'Restaurant', serves: ['cocktails'], has: [], hours: HOURS }, web: { deals: [] }, interests: [{ name: 'Oysters', who: 'jake', level: 'love' }, { name: 'Margaritas', who: 'kelly', level: 'love' }, { name: 'Clubs', who: 'jake', level: 'no' }], driveMin: 64 })
  assert.match(p, /- Oysters — Jake loves it/)
  assert.match(p, /- Margaritas — Kelly loves it/)
  assert.match(p, /rather not:\n- Clubs \(Jake\)/)
  assert.match(p, /64-minute drive/)
  assert.match(p, /Never invent/)
  const r = parseForYou(JSON.stringify({ for_you: [
    { mark: 'yes', head: 'Oysters, for Jake', line: 'A raw bar, and oysters at happy hour.', from: 'lmgfl.com' },
    { mark: 'maybe', head: 'Margaritas, for Kelly?', line: 'Cocktails, but no page names a margarita.', from: 'Google' },
    { mark: 'great', head: 'x', line: 'y' },
    { mark: 'note', head: 'A whole night out', line: 'About an hour each way.', from: null },
  ], best_time: 'Happy hour at the bar on a Wednesday or Thursday.' }))
  assert.deepEqual(r.for_you.map((x) => x.mark), ['yes', 'maybe', 'note'])
  assert.equal(r.for_you[2].from, null)
  assert.equal(r.best_time, 'Happy hour at the bar on a Wednesday or Thursday.')
  assert.deepEqual(parseForYou('nope'), { for_you: [], best_time: null })
})
