import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { FULL_AI_TOOLS, READ_TOOLS, fullAiCard, directionsFor, fullAiStatus } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Directions to someone (Jake, 2026-09-29 10:00 PM on the wall: "Navigate to Alice's house" → couldn't;
// "Can you give me a link so I can click it" → couldn't; "That stinks"). Canvas 13c/13d, approved
// 2026-09-30: Casa finds the person, answers with the address, and the screen carries the route —
// a QR code on the wall (Google Maps on his phone), a button on a computer or the phone.
const contacts = [
  { id: 'c-alice', name: 'Alice', aliases: [], relationship: 'contact', phone: '(561) 555-0101', address: '8255 West Lake Drive, Lake Clark Shores, FL 33406', place: "Alice's House" },
  { id: 'c-coach', name: 'Mike Ruiz', aliases: ['Coach Mike'], relationship: "Liv's softball coach", phone: null, address: '900 Southern Blvd, West Palm Beach, FL 33405', place: null },
  { id: 'c-bob', name: 'Bob', aliases: [], relationship: 'contact', phone: '5615550199', address: null, place: null },
]
const places = [{ name: 'Lake Lytal Park', address: '3645 Gun Club Rd, West Palm Beach', phone: null }]

test('Casa has a way to give directions (a lookup) and to save an address it was told (a card)', () => {
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'show_directions'))
  assert.ok(READ_TOOLS.has('show_directions'), 'looked up on the server, no card')
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'save_address'))
  assert.ok(!READ_TOOLS.has('save_address'), 'saving is a card he says yes to')
  assert.equal(fullAiStatus({ name: 'show_directions', args: {} }), null)
})

test('directions: a person by name, "her house", an alias, the relationship, or a saved place', () => {
  const maps = (a) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}`
  assert.deepEqual(directionsFor('Alice', { contacts, places }), { name: 'Alice', address: contacts[0].address, phone: '(561) 555-0101', maps: maps(contacts[0].address) })
  assert.equal(directionsFor('alice’s house', { contacts, places })?.name, 'Alice')
  assert.equal(directionsFor("Alice's House", { contacts, places })?.name, 'Alice')
  assert.equal(directionsFor('Coach Mike', { contacts, places })?.name, 'Mike Ruiz')
  assert.equal(directionsFor("Liv's softball coach", { contacts, places })?.name, 'Mike Ruiz')
  assert.equal(directionsFor('Lake Lytal', { contacts, places })?.address, '3645 Gun Club Rd, West Palm Beach')
})

test('no address saved: Casa is told whom to ask about; no one by that name: nothing', () => {
  assert.deepEqual(directionsFor('Bob', { contacts, places }), { missing: 'Bob' })
  assert.equal(directionsFor('Zelda', { contacts, places }), null)
  assert.equal(directionsFor('', { contacts, places }), null)
  // Live, 2026-09-30: a contact named "Lake Lytal Park" (no address) hid the saved place with one.
  const both = [...contacts, { id: 'c-park', name: 'Lake Lytal Park', aliases: [], relationship: 'contact', phone: null, address: null, place: null }]
  assert.equal(directionsFor('Lake Lytal Park', { contacts: both, places })?.address, '3645 Gun Club Rd, West Palm Beach')
})

test('an address he tells Casa becomes a card to save it on that person', () => {
  const ctx = { events: [], utcOffset: '-04:00', now: new Date(), contacts }
  assert.deepEqual(fullAiCard({ name: 'save_address', args: { contact: 'Bob', address: '12 Palm Way, Jupiter' } }, ctx), { tool: 'save_address', args: { contact_id: 'c-bob', name: 'Bob', address: '12 Palm Way, Jupiter' } })
  assert.match(fullAiCard({ name: 'save_address', args: { contact: 'Zelda', address: '1 A St' } }, ctx).error, /Zelda/)
  assert.match(fullAiCard({ name: 'save_address', args: { contact: 'Bob', address: '' } }, ctx).error, /address/)
})

test('the pieces are wired: contacts with addresses, the route on the answer, the save on a yes', () => {
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /from\('contact_directory'\)/)
  assert.match(server, /call\.name === 'show_directions'/)
  assert.match(server, /directions: shownRoute/)
  assert.match(server, /'save_address'/)
  const action = fs.readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  assert.match(action, /tool === 'save_address'/)
  const client = fs.readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
  assert.match(client, /directions: data\.directions/)
})

// Live, 2026-09-30: "Navigate to Alice's house" got the address and "Would you like directions?"; "Can you
// give me a link" got "I can't provide a direct link" — the model didn't know the screen could.
test('Casa knows the screen shows the route, and that an address he gives is a card to save', async () => {
  const { buildFullAiSystem } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-30T14:00:00Z'), homeCity: 'West Palm Beach', contacts })
  assert.match(system, /never say you can't give directions or a link/)
  assert.match(system, /save_address \(its card asks his yes/)
  assert.match(system, /Alice · contact · \(561\) 555-0101 · lives at 8255 West Lake Drive/)
})

test('the turn reader hears who or where he wants to go, and the server answers with the route itself', async () => {
  const { buildTurnPrompt, readTurnResolution } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Directions to Lake Lytal' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' })
  assert.match(prompt, /"directions_to":/)
  assert.equal(readTurnResolution({ act: 'other', directions_to: 'Lake Lytal' }).directionsTo, 'Lake Lytal')
  assert.equal(readTurnResolution({ act: 'aside', directions_to: 'Lake Lytal' }).directionsTo, null)
  assert.equal(readTurnResolution({ act: 'question', directions_to: '  ' }).directionsTo, null)
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /if \(turnResolution\?\.directionsTo && !context\?\.pendingAction\)/)
  assert.match(server, /semantic_intent: 'conversation\.directions'/)
})

test('an address he gives for someone becomes the save card, from the reader', async () => {
  const { readTurnResolution, buildTurnPrompt } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  assert.match(buildTurnPrompt({ messages: [{ role: 'user', content: 'x' }], draft: null, referents: [], upcoming: [], family: [], nowLine: 'Now', utcOffset: '-04:00', nowIso: '2026-09-30T14:00:00Z' }), /"address_for":/)
  assert.deepEqual(readTurnResolution({ act: 'other', address_for: { who: 'Mary RBT', address: '412 Palm Way, Jupiter' } }).addressFor, { who: 'Mary RBT', address: '412 Palm Way, Jupiter' })
  assert.equal(readTurnResolution({ act: 'other', address_for: { who: 'Mary RBT', address: '' } }).addressFor, null)
  // Loco (Oct 9): "a tequila and oyster bar in West Palm Beach" is a place to try — a town is not an address.
  assert.equal(readTurnResolution({ act: 'other', address_for: { who: 'Loco', address: 'West Palm Beach' } }).addressFor, null)
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /semantic_intent: 'conversation\.save_address'/)
})

// Live, 2026-09-30: after Casa's own "What is it?", the reader didn't mark "It's 412 Palm Way, Jupiter" as
// an address (3 of 3), and the model answered in words. Casa asked, so the reply is read here.
test('the reply to Casa’s "What is it?" is the address to save; anything else is not', async () => {
  const { askAddress, addressReply } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  assert.deepEqual(addressReply(askAddress('Mary RBT'), 'It’s 412 Palm Way, Jupiter'), { who: 'Mary RBT', address: '412 Palm Way, Jupiter' })
  assert.deepEqual(addressReply(askAddress('Mary RBT'), '412 Palm Way, Jupiter.'), { who: 'Mary RBT', address: '412 Palm Way, Jupiter' })
  assert.equal(addressReply(askAddress('Mary RBT'), 'never mind'), null)
  assert.equal(addressReply('Here’s the way to Alice.', '412 Palm Way'), null)
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /addressReply\(lastSaid, turnContext\?\.originalText \?\? latestUserText\)/)
  assert.deepEqual(addressReply(askAddress('Mary RBT'), 'Mary RBT’s address is 412 Palm Way, Jupiter'), { who: 'Mary RBT', address: '412 Palm Way, Jupiter' }, 'the reader’s rewrite reads the same')
})
