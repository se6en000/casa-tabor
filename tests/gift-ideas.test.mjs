import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FULL_AI_TOOLS, READ_TOOLS, fullAiCard, giftIdeasForViewer } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Gift ideas per person (FAMILY_WALL_PLAN.md P3.19 step 2; Jake 2026-09-27: "let's go with your
// suggestion"). Thoughtful gifts come from ideas collected during the year: "Casa, gift idea for
// Kelly: that ceramic class". Saved with a yes like any change; never shown to the person they're
// for, and never read out on the shared wall.
const family = [{ id: 'm-jake', name: 'Jake', role: 'parent' }, { id: 'm-kelly', name: 'Kelly', role: 'parent' }, { id: 'm-liv', name: 'Liv', role: 'child' }]
const ctx = { events: [], utcOffset: '-04:00', now: new Date('2026-09-27T12:00:00-04:00'), groceries: [], family }

test('saving an idea is a card; reading them is a lookup', () => {
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'add_gift_idea'))
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'get_gift_ideas'))
  assert.ok(READ_TOOLS.has('get_gift_ideas'))
  assert.ok(!READ_TOOLS.has('add_gift_idea'))
})

test('the card names who it is for, linked to the family member when it is one of them', () => {
  assert.deepEqual(
    fullAiCard({ name: 'add_gift_idea', args: { for: 'kelly', idea: ' that ceramic class in Delray ' } }, ctx),
    { tool: 'add_gift_idea', args: { for_name: 'Kelly', for_member_id: 'm-kelly', idea: 'that ceramic class in Delray' } },
  )
  assert.deepEqual(
    fullAiCard({ name: 'add_gift_idea', args: { for: 'Jebb', idea: 'a soccer team sweatshirt' } }, ctx),
    { tool: 'add_gift_idea', args: { for_name: 'Jebb', for_member_id: null, idea: 'a soccer team sweatshirt' } },
  )
  assert.match(fullAiCard({ name: 'add_gift_idea', args: { for: 'Kelly', idea: '' } }, ctx).error, /idea/)
  assert.match(fullAiCard({ name: 'add_gift_idea', args: { idea: 'socks' } }, ctx).error, /who/)
})

const rows = [
  { for_name: 'Kelly', for_member_id: 'm-kelly', idea: 'ceramic class', created_at: '2026-06-02T12:00:00Z' },
  { for_name: 'Jake', for_member_id: 'm-jake', idea: 'new grill brush', created_at: '2026-07-01T12:00:00Z' },
  { for_name: 'Jebb', for_member_id: null, idea: 'soccer sweatshirt', created_at: '2026-09-17T12:00:00Z' },
]

test('on a phone that knows who is holding it, never the ideas for that person', () => {
  const forJake = giftIdeasForViewer(rows, { viewerMemberId: 'm-jake', page: 'phone', forName: null })
  assert.deepEqual(forJake.ideas.map((i) => i.idea), ['ceramic class', 'soccer sweatshirt'])
  const forKelly = giftIdeasForViewer(rows, { viewerMemberId: 'm-kelly', page: 'phone', forName: null })
  assert.deepEqual(forKelly.ideas.map((i) => i.idea), ['new grill brush', 'soccer sweatshirt'])
  assert.deepEqual(giftIdeasForViewer(rows, { viewerMemberId: 'm-kelly', page: 'phone', forName: 'kelly' }).ideas, [])
})

// Jake, 2026-09-27: "I'd still like it all to show up on the wall as well as phone. Later I can make it more private."
test('on the wall, all of them for now', () => {
  assert.deepEqual(giftIdeasForViewer(rows, { viewerMemberId: 'm-kelly', page: 'wall', forName: null }).ideas.map((i) => i.idea), ['ceramic class', 'new grill brush', 'soccer sweatshirt'])
  assert.deepEqual(giftIdeasForViewer(rows, { viewerMemberId: null, page: 'wall', forName: 'Kelly' }).ideas.map((i) => i.idea), ['ceramic class'])
})

test('the turn reader sends gift ideas to the full assistant, not to the calendar', () => {
  const reader = readFileSync(new URL('../supabase/functions/_shared/assistant-turn-context.mjs', import.meta.url), 'utf8')
  assert.match(reader, /"other":[^\n]*gift ideas/)
})

test('saved server-side only: its own table with row security and no client access; a yes saves it', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260927220000_gift_ideas.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists public\.gift_ideas/)
  assert.match(sql, /alter table public\.gift_ideas enable row level security/)
  assert.doesNotMatch(sql, /create policy/)
  assert.match(sql, /gift_ideas_for_member_id_idx/)
  assert.match(sql, /gift_ideas_created_by_member_id_idx/)
  const action = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')
  assert.match(action, /if \(tool === 'add_gift_idea'\)[\s\S]{0,600}\.from\('gift_ideas'\)\s+\.insert\(/)
})

// Jake's bug report 2026-09-27 3:24 PM: "Gift idea for Olivia …" saved, then "What are some gift ideas
// for Liv?" → none. Liv's full name is Olivia Tabor: a person is the same person by any of their names —
// when saving, when reading back, and when keeping ideas off the phone of the person they're for.
const namedFamily = [
  { id: 'm-jake', name: 'Jake', full_name: 'Jacob Tabor', role: 'parent' },
  { id: 'm-liv', name: 'Liv', full_name: 'Olivia Tabor', role: 'child' },
  { id: 'm-emme', name: 'Emme', full_name: 'Emerson Tabor', role: 'child' },
]

test('a gift idea is linked to the family member by any of their names', () => {
  const card = (who) => fullAiCard({ name: 'add_gift_idea', args: { for: who, idea: 'a gymnastics coach' } }, { ...ctx, family: namedFamily }).args
  for (const who of ['Olivia', 'olivia tabor', 'Liv', 'LIV']) assert.deepEqual([card(who).for_name, card(who).for_member_id], ['Liv', 'm-liv'], who)
  assert.equal(card('Emerson').for_member_id, 'm-emme')
  assert.equal(card('Tabor').for_member_id, null) // a family name alone is nobody in particular
})

test('ideas read back for a person whichever of their names was used, either way round', () => {
  const saved = [
    { for_name: 'Olivia', for_member_id: null, idea: 'a gymnastics coach', created_at: '2026-09-27T19:23:44Z' },
    { for_name: 'Liv', for_member_id: 'm-liv', idea: 'a leotard', created_at: '2026-09-27T19:30:00Z' },
    { for_name: 'Jebb', for_member_id: null, idea: 'soccer sweatshirt', created_at: '2026-09-17T12:00:00Z' },
  ]
  const ask = (forName) => giftIdeasForViewer(saved, { viewerMemberId: 'm-jake', page: 'phone', forName, family: namedFamily }).ideas.map((i) => i.idea)
  for (const who of ['Liv', 'Olivia', 'olivia tabor']) assert.deepEqual(ask(who), ['a gymnastics coach', 'a leotard'], who)
  assert.deepEqual(ask('jebb'), ['soccer sweatshirt'])
})

test('an idea saved under a nickname or full name never reaches that person\'s phone', () => {
  const saved = [
    { for_name: 'Olivia', for_member_id: null, idea: 'a gymnastics coach', created_at: '2026-09-27T19:23:44Z' },
    { for_name: 'Jebb', for_member_id: null, idea: 'soccer sweatshirt', created_at: '2026-09-17T12:00:00Z' },
  ]
  assert.deepEqual(giftIdeasForViewer(saved, { viewerMemberId: 'm-liv', page: 'phone', forName: null, family: namedFamily }).ideas.map((i) => i.idea), ['soccer sweatshirt'])
})

test('the assistant is told each person\'s full name, so "Olivia" reads as Liv', async () => {
  const { buildFullAiSystem } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const system = buildFullAiSystem({ family: namedFamily, events: [], groceries: [], pending: [], onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-09-27T12:00:00-04:00') })
  assert.match(system, /Liv \(Olivia Tabor/)
})
