import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReaderPrompt, readReaderDecision } from '../supabase/functions/_shared/email-reader.mjs'
import { keptPostedBy, postedStatus, postedLine, ruleFromText, quietFor } from '../supabase/functions/_shared/email-offers.mjs'

// Casa reads the email, phase 3 — "Keep me posted" (canvas row 15, approved by Jake 2026-09-30). Jake: "I want
// to see emails from Sally generally … dances and other events for Liv, but also she sends out marketing
// garbage … I'd rather get a summary of what she is saying vs nothing at all."

const email = { from_email: '"Sally Rozanski" <Sally.Rozanski@palmbeachschools.org>', subject: 'Showcase of Schools 10/6', received_at: '2026-09-29T14:00:00Z', body: 'Join us…' }

test('the reader always writes a line of what the email says, and names a kept topic it is about', () => {
  const p = buildReaderPrompt({ email, today: '2026-09-30', topics: ['Owen’s therapy'] })
  assert.match(p, /Always also write "gist": one line: what the email says/)
  assert.match(p, /KEEP HIM POSTED ON[\s\S]*- Owen’s therapy/)
  assert.doesNotMatch(buildReaderPrompt({ email, today: '2026-09-30' }), /KEEP HIM POSTED ON/)
  const r = readReaderDecision({ decision: 'none', reason: 'an ad', gist: 'Yearbook ads for sale: celebrate your eighth grader', gist_tag: 'ad', posted: null })
  assert.equal(r.gist, 'Yearbook ads for sale: celebrate your eighth grader')
  assert.equal(r.gist_tag, 'ad')
  assert.equal(readReaderDecision({ decision: 'none', gist_tag: 'shouting' }).gist_tag, null)
  assert.equal(readReaderDecision({ decision: 'none', posted: 'Owen’s therapy' }).posted, 'Owen’s therapy')
})

test('told it matters (That one mattered), the reader offers what the email asks rather than passing', () => {
  assert.match(buildReaderPrompt({ email, today: '2026-09-30', matters: true }), /Jake says this email matters/)
  assert.doesNotMatch(buildReaderPrompt({ email, today: '2026-09-30' }), /Jake says this email matters/)
})

test('a kept sender, by address; a kept topic, by the reader’s word for it', () => {
  const rules = [
    { id: 's', kind: 'sender', sender: 'sally.rozanski@palmbeachschools.org', label: 'Sally Rozanski' },
    { id: 't', kind: 'topic', topic: 'Owen’s therapy', label: 'Anything about Owen’s therapy' },
  ]
  assert.equal(keptPostedBy(email, rules, null)?.id, 's')
  assert.equal(keptPostedBy({ from_email: 'towhid@hopecenteraba.com' }, rules, 'owen’s therapy')?.id, 't')
  assert.equal(keptPostedBy({ from_email: 'news@pbday.org' }, rules, null), null)
  assert.equal(keptPostedBy({ from_email: 'news@pbday.org' }, rules, 'something else'), null)
})

test('a posted line waits a week; older mail stays a shadow', () => {
  const now = new Date('2026-09-30T15:00:00Z')
  assert.equal(postedStatus('2026-09-25T12:00:00Z', now), 'posted')
  assert.equal(postedStatus('2026-09-20T12:00:00Z', now), 'shadow')
})

test('a posted line: its gist (else the subject), a plain tag, and Add it only when there is something to add', () => {
  assert.deepEqual(postedLine({ gist: 'Fall dance Fri Oct 16, 6–8 PM', gist_tag: 'event', subject: 'Dance!', decision: 'offer', offers: [{ kind: 'event' }] }),
    { gist: 'Fall dance Fri Oct 16, 6–8 PM', tag: 'An event', can_add: true })
  assert.deepEqual(postedLine({ gist: null, gist_tag: null, subject: 'Bak eighth-grade students: don’t delay', decision: 'none', offers: [] }),
    { gist: 'Bak eighth-grade students: don’t delay', tag: null, can_add: false })
  assert.equal(postedLine({ gist: 'x', gist_tag: 'ad', decision: 'none', offers: [] }).tag, 'An ad')
  assert.equal(postedLine({ gist: 'x', gist_tag: 'request', decision: 'person', person: { who: 'A', wants: 'b' } }).can_add, true)
})

test('typed in Settings: an address keeps that sender; anything else is a topic', () => {
  assert.deepEqual(ruleFromText('Coach.Rivera@gmail.com'), { kind: 'sender', sender: 'coach.rivera@gmail.com', topic: null, label: 'coach.rivera@gmail.com' })
  assert.deepEqual(ruleFromText('  anything about Owen’s therapy '), { kind: 'topic', sender: null, topic: 'anything about Owen’s therapy', label: 'anything about Owen’s therapy' })
  assert.equal(ruleFromText('   '), null)
})

test('Not needed on a posted line teaches nothing, and Bring back ends a quiet', () => {
  const row = { id: 'b', from_email: 'news@pbday.org', decision: 'offer', offers: [{ kind: 'todo' }], status: 'waiting', feedback: null }
  const posted = { id: 'a', from_email: 'news@pbday.org', decision: 'offer', offers: [{ kind: 'todo' }], status: 'not_needed', answered_at: '2026-09-30T13:00:00Z', posted_by: 's' }
  assert.equal(quietFor(row, [posted]), null)
  const released = { ...posted, posted_by: null, unquieted_at: '2026-09-30T14:00:00Z' }
  assert.equal(quietFor(row, [released]), null)
  assert.equal(quietFor(row, [{ ...posted, posted_by: null }])?.by, 'a')
})

test('a name written in capitals reads as a name ("SALLY ROZANSKI" → Sally Rozanski); others are kept as written', async () => {
  const { senderName } = await import('../supabase/functions/_shared/email-offers.mjs')
  assert.equal(senderName('"SALLY ROZANSKI" <sally.rozanski@palmbeachschools.org>'), 'Sally Rozanski')
  assert.equal(senderName('Mrs. McDonald <m@x.org>'), 'Mrs. McDonald')
  assert.equal(senderName('PTO <pto@x.org>'), 'PTO', 'a short acronym stays')
})

test('said to Casa ("keep me posted on emails from Liv’s coach"): a card asking his yes', async () => {
  const { fullAiCard, FULL_AI_TOOLS } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  assert.ok(FULL_AI_TOOLS.some((t) => t.name === 'keep_me_posted'))
  assert.deepEqual(fullAiCard({ name: 'keep_me_posted', args: { about: ' emails from Liv’s coach ' } }, { events: [] }), { tool: 'keep_me_posted', args: { about: 'emails from Liv’s coach' } })
  assert.ok(fullAiCard({ name: 'keep_me_posted', args: { about: '' } }, { events: [] }).error)
})

// Said in any words (live 2026-09-30: "let me know whenever Owen's therapist writes" and "make sure I see stuff
// from the PTO from now on" got "I'll make a card for you to confirm" and no card): the turn reader spots it
// and the server makes the card, as it does for get & pack.
test('the turn reader names who or what he wants to hear about from now on; the server makes the card', async () => {
  const { buildTurnPrompt, readTurnResolution } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const { readFileSync } = await import('node:fs')
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'let me know whenever Owen’s therapist writes' }], upcoming: [], family: [] })
  assert.match(prompt, /"keep_posted": when the latest message asks to hear from someone, or about something, from now on/)
  assert.equal(readTurnResolution({ act: 'other', keep_posted: ' emails from Owen’s therapist ' }, {}).keepPosted, 'emails from Owen’s therapist')
  assert.equal(readTurnResolution({ act: 'aside', keep_posted: 'x' }, {}).keepPosted, null, 'not from a remark to someone else')
  assert.equal(readTurnResolution({ act: 'question', keep_posted: null }, {}).keepPosted, null)
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.ok(server.indexOf('} else if (resolution.keepPosted) {') > 0 && server.indexOf('} else if (resolution.keepPosted) {') < server.indexOf("} else if (resolution.act === 'add') {"))
  assert.match(server, /semantic_intent: 'conversation\.keep_posted'/)
})
