import test from 'node:test'
import assert from 'node:assert/strict'
import { senderOf, kindOf, quietFor } from '../supabase/functions/_shared/email-offers.mjs'

// Casa reads the email, phase 3 (design doc, approved 2026-09-30): "Not needed quiets that kind of email from
// that sender." Quieted isn't gone: it goes to "a few I skipped" with its reason, and "That one mattered"
// brings that sender back — one school address sends both fundraisers and permission slips.

const row = (over) => ({ id: 'x', from_email: '"Palm Beach Day" <news@pbday.org>', decision: 'offer', offers: [{ kind: 'todo', title: 'Buy a raffle ticket' }], status: 'waiting', feedback: null, answered_at: null, ...over })

test('the sender is the address, whatever the display name; the kind is what it would add', () => {
  assert.equal(senderOf('"Palm Beach Day" <News@PBDay.org>'), 'news@pbday.org')
  assert.equal(senderOf('news@pbday.org'), 'news@pbday.org')
  assert.equal(kindOf(row()), 'todo')
  assert.equal(kindOf(row({ decision: 'person', offers: [] })), 'person')
  assert.equal(kindOf(row({ decision: 'details', offers: [{ event_id: 'e' }] })), 'details')
  assert.equal(kindOf(row({ offers: [{ kind: 'event' }, { kind: 'todo' }] })), 'event')
})

test('after Not needed, the next one of that kind from that sender is quiet, with its reason', () => {
  const said = row({ id: 'a', status: 'not_needed', answered_at: '2026-09-30T13:00:00Z' })
  const q = quietFor(row({ id: 'b' }), [said])
  assert.equal(q?.by, 'a')
  assert.equal(q?.reason, 'You said Not needed to one like it from Palm Beach Day on Sep 30')
})

test('another kind from that sender, or that kind from someone else, still comes', () => {
  const said = row({ id: 'a', status: 'not_needed', answered_at: '2026-09-30T13:00:00Z' })
  assert.equal(quietFor(row({ id: 'b', offers: [{ kind: 'event', title: 'Picture day' }] }), [said]), null)
  assert.equal(quietFor(row({ id: 'b', from_email: 'office@pbday.org' }), [said]), null)
})

test('the latest answer wins: Add it, or That one mattered, brings that sender back', () => {
  const no = row({ id: 'a', status: 'not_needed', answered_at: '2026-09-30T13:00:00Z' })
  const yes = row({ id: 'c', status: 'added', answered_at: '2026-10-01T09:00:00Z' })
  assert.equal(quietFor(row({ id: 'b' }), [no, yes]), null)
  const mattered = row({ id: 'd', decision: 'none', offers: [], status: 'shadow', feedback: 'mattered', answered_at: '2026-10-01T09:00:00Z' })
  assert.equal(quietFor(row({ id: 'b' }), [no, mattered]), null, 'That one mattered is about the sender, any kind')
  const noAgain = row({ id: 'e', status: 'not_needed', answered_at: '2026-10-02T09:00:00Z' })
  assert.equal(quietFor(row({ id: 'b' }), [no, yes, noAgain])?.by, 'e')
})

test('one he brought back (That one mattered) is never quieted again, and a Not needed never quiets itself', () => {
  const no = row({ id: 'a', status: 'not_needed', answered_at: '2026-09-30T13:00:00Z' })
  assert.equal(quietFor(row({ id: 'b', feedback: 'mattered' }), [no]), null)
  assert.equal(quietFor(no, [no]), null)
})
