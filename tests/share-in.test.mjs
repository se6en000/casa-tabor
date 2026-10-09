import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlsIn, wordsOf, sourceOf, linkFacts, tiktokFacts, factsSayAnything, parseShare, itemWhen, shareReply, sharedShelf, sharedHeard, sharePrompt } from '../supabase/functions/_shared/share-in.mjs'
import { GUIDE_SHELVES, placesByShelf } from '../supabase/functions/_shared/guide.mjs'

test('share-in: a share\'s link, its words, and where it came from', () => {
  assert.deepEqual(urlsIn('look! https://www.instagram.com/p/DAbc123xyz/?igsh=abc.'), ['https://www.instagram.com/p/DAbc123xyz/?igsh=abc'])
  assert.equal(wordsOf('https://www.instagram.com/p/DAbc123xyz/'), '')
  assert.equal(wordsOf('IMG_2231.PNG'), '')
  assert.equal(wordsOf('Image'), '', 'the Shortcut sends a picture\'s words as "Image" (Oct 9)')
  assert.equal(wordsOf('Screenshot 2026-10-09 at 8.14.22 PM.png'), '')
  assert.equal(wordsOf('Dinner at Mr B’s Saturday 7pm with the Springmyers'), 'Dinner at Mr B’s Saturday 7pm with the Springmyers')
  assert.equal(sourceOf({ url: 'https://www.instagram.com/reel/x/' }), 'Instagram')
  assert.equal(sourceOf({ url: 'https://vm.tiktok.com/ZMabc/' }), 'TikTok')
  assert.equal(sourceOf({ url: 'https://www.eventbrite.com/e/123' }), 'eventbrite.com')
  assert.equal(sourceOf({ hasImage: true, screenshot: true }), 'a screenshot')
  assert.equal(sourceOf({}), 'a text')
})

test('share-in: what a page says about itself — Instagram\'s card, a page\'s event, a recipe; a login wall says nothing', () => {
  // Instagram's real card for a post (Oct 9, fetched by a server: the caption is there).
  const ig = linkFacts('<meta property="og:title" content="Just An Egg &#x1f95a; on Instagram: &quot;Let&#x2019;s set a world record together&quot;" /><meta property="og:image" content="https://scontent.cdninstagram.com/x.jpg" /><meta name="description" content="60M likes - world_record_egg on January 4, 2019: &quot;Let&#x2019;s set a world record&quot;" />')
  assert.match(ig.title, /Just An Egg 🥚 on Instagram: "Let’s set a world record together"/)
  assert.equal(ig.image, 'https://scontent.cdninstagram.com/x.jpg')
  assert.ok(factsSayAnything(ig))
  const page = linkFacts('<title>Fall Fest</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Fall Fest","startDate":"2026-10-17T11:00","location":{"@type":"Place","name":"Roosevelt Elementary","address":{"streetAddress":"1220 15th St","addressLocality":"West Palm Beach"}}}</script>')
  assert.equal(page.title, 'Fall Fest')
  assert.deepEqual(page.declared[0], { type: 'Event', name: 'Fall Fest', startDate: '2026-10-17T11:00', endDate: null, location: 'Roosevelt Elementary', address: '1220 15th St, West Palm Beach' })
  assert.ok(linkFacts('<script type="application/ld+json">[{"@type":["Recipe"],"name":"Gnocchi"}]</script>').recipe)
  assert.equal(factsSayAnything(linkFacts('<title>Instagram</title><meta property="og:site_name" content="Instagram">')), false)
  assert.equal(factsSayAnything(null), false)
  const tt = tiktokFacts({ title: 'Best oysters in Lake Worth 🦪 #wpb', author_name: 'eatwpb', thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg' })
  assert.equal(tt.description, 'Posted by eatwpb')
  assert.ok(factsSayAnything(tt))
})

test('share-in: the reader\'s answer is checked — a place needs its name; unknown kinds are other', () => {
  assert.deepEqual(parseShare('```json\n{"kind":"place","summary":"An oyster bar in Lake Worth","place":{"name":"Oyster Bar","town":"Lake Worth Beach","said":"best oysters in town"}}\n```'), { kind: 'place', summary: 'An oyster bar in Lake Worth', place: { name: 'Oyster Bar', town: 'Lake Worth Beach', said: 'best oysters in town' } })
  assert.equal(parseShare('{"kind":"place","summary":"x","place":{"name":""}}').kind, 'other')
  assert.equal(parseShare('{"kind":"meme"}').kind, 'other')
  assert.equal(parseShare('nonsense').kind, 'other')
  assert.equal(parseShare('{"kind":"events","summary":"Fall Fest"}').kind, 'events')
  const prompt = sharePrompt({ today: 'Friday, October 9, 2026', source: 'Instagram', words: '', facts: { title: 'eatwpb on Instagram: "Lucky Lou’s"', description: null, site: 'Instagram', declared: [] }, hasImage: true, members: ['Jake', 'Kelly'] })
  assert.match(prompt, /from Instagram/)
  assert.match(prompt, /A picture is attached/)
  assert.match(prompt, /Lucky Lou’s/)
})

test('share-in: what the phone is told', () => {
  const fest = { type: 'event', title: 'Fall Fest', date: '2026-10-17', all_day: false, start_time_local: '11:00', end_time_local: '15:00' }
  assert.equal(itemWhen(fest), 'Sat, Oct 17 · 11 AM – 3 PM')
  assert.equal(itemWhen({ date: '2026-10-20', all_day: true }), 'Tue, Oct 20')
  assert.equal(shareReply({ kind: 'events', items: [fest] }), 'Fall Fest · Sat, Oct 17 · 11 AM – 3 PM. Add it? It’s waiting in Tabor House.')
  assert.equal(shareReply({ kind: 'events', summary: 'the PTO flyer', items: [fest, { ...fest, title: 'Picture day' }, { type: 'prep', title: 'Lunch' }] }), '2 dates from the PTO flyer. They’re waiting in Tabor House for your yes.')
  assert.equal(shareReply({ kind: 'events', items: [] }), 'I couldn’t find a date in it.')
  assert.equal(shareReply({ kind: 'place', found: true, name: 'Lucky Lou’s', town: 'Delray Beach', minutes: 31 }), 'Saved Lucky Lou’s to Places worth trying — Delray Beach, 31 min.')
  assert.equal(shareReply({ kind: 'place', found: false, name: 'Lucky Lou’s' }), 'I couldn’t find Lucky Lou’s on Google Maps. It’s kept with what you shared.')
  assert.equal(shareReply({ kind: 'recipe', name: 'Crispy gnocchi' }), 'Saved Crispy gnocchi to Recipes.')
  assert.match(shareReply({ kind: 'unreadable', source: 'Instagram' }), /couldn’t see that post from here\. Double-tap the back of your phone/)
  assert.match(shareReply({ kind: 'other' }), /no date, place or recipe/)
})

test('share-in: a shared place goes on its shelf (else "You shared", shown first) and says who shared it', () => {
  assert.deepEqual(sharedShelf(GUIDE_SHELVES, 'Oyster bar restaurant Lucky Lou’s'), { id: 'oysters', label: 'Oysters & raw bars' })
  assert.deepEqual(sharedShelf(GUIDE_SHELVES, 'Italian restaurant'), { id: 'shared', label: 'You shared' })
  assert.equal(sharedHeard('Jake', 'Instagram', 'best oysters in town'), 'Jake shared it from Instagram. Best oysters in town')
  assert.equal(sharedHeard('Kelly', 'a screenshot', null), 'Kelly shared it from a screenshot.')
  assert.equal(sharedHeard('Jake', 'Alexa', null), 'Jake asked Alexa to save it.')
  assert.equal(sharedHeard('Jake', 'a text', null), 'Jake saved it.')
  // Loco (Oct 9): "a tequila and oyster bar" is oysters, though Google calls it a Mexican restaurant.
  assert.deepEqual(sharedShelf(GUIDE_SHELVES, 'A tequila and oyster bar in West Palm Beach Mexican Restaurant mexican_restaurant bar'), { id: 'oysters', label: 'Oysters & raw bars' })
  const { shown } = placesByShelf([{ shelf: 'bars', shelf_label: 'Neighborhood bars', status: 'live' }, { shelf: 'shared', shelf_label: 'You shared', status: 'saved' }])
  assert.deepEqual(shown.map((s) => s.shelf), ['shared', 'bars'])
})

test('share-in: Alexa saves a place to try at once (no card), and says so while it looks', async () => {
  const { FULL_AI_TOOLS, READ_TOOLS, fullAiStatus } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'save_place'))
  assert.ok(READ_TOOLS.has('save_place'), 'saved on the server at once, like remember')
  assert.equal(fullAiStatus({ name: 'save_place', args: { name: 'Loco' } }), 'Finding Loco on Google Maps…')
})

test('share-in: when Alexa promised to save it and is sent back to act, save_place is one of the tools she may use', async () => {
  const { fullAiRequest, fullAiTools } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const req = fullAiRequest({ system: 's', contents: [], tools: fullAiTools({ planning: false }), mustAct: true })
  assert.ok(req.tool_config.function_calling_config.allowed_function_names.includes('save_place'))
})
