import test from 'node:test'
import assert from 'node:assert/strict'
import { addsCard } from '../src/wall/addsCard.ts'

// Jake, Oct 7: "i need to see on the card, what will actually be added for the get and prep, or notes when adding this
// stuff to an existing event. its a confidence thing". Each line it adds, one by one; notes with what's there already.
const events = [
  { id: 'yb', title: 'Yearbook Picture Day! (wear uniforms)', start_time: '2026-10-20T04:00:00Z', end_time: '2026-10-21T04:00:00Z', all_day: true, location_name: null, address: null, description: null },
  { id: 'hb', title: 'Text Heather a happy birthday message', event_type: 'reminder', start_time: '2026-10-08T11:00:00Z', end_time: '2026-10-08T11:15:00Z', all_day: false, location_name: null, address: null, description: 'Ideas:\n- "Happy birthday!"\nTabor House · from Coach’s email · Sep 22' },
]

test('get & pack: every line it adds, on its event', () => {
  const c = addsCard({ tool: 'add_prep_item', args: { event_id: 'yb', event_title: 'Yearbook Picture Day! (wear uniforms)', labels: ['Pick out good shirts', 'Do their hair'] } }, events)
  assert.equal(c.kind, 'prep')
  assert.equal(c.title, 'Yearbook Picture Day! (wear uniforms)')
  assert.match(c.when, /Tue, Oct 20/)
  assert.deepEqual(c.adding, ['Pick out good shirts', 'Do their hair'])
  assert.equal(c.yes, 'Yes, add 2')
  assert.deepEqual(addsCard({ tool: 'add_prep_item', args: { event_id: 'yb', label: 'Water' } }, events).adding, ['Water'])
  assert.equal(addsCard({ tool: 'add_prep_item', args: { event_id: 'yb', label: 'Water' } }, events).yes, 'Yes, add it')
})

test('notes: what is there (never the house’s tags), then the lines it adds', () => {
  const c = addsCard({ tool: 'update_event', args: { id: 'hb', notes_add: ['She loves lilies'] } }, events)
  assert.equal(c.kind, 'notes')
  assert.deepEqual(c.existing, ['Ideas:', '- "Happy birthday!"'])
  assert.deepEqual(c.adding, ['She loves lilies'])
  assert.equal(c.yes, 'Yes, add to the notes')
  // A change that also moves it or renames it is the full card's; nothing here.
  assert.equal(addsCard({ tool: 'update_event', args: { id: 'hb', notes_add: ['x'], start: '2026-10-08T12:00:00Z' } }, events), null)
  assert.equal(addsCard({ tool: 'create_event', args: {} }, events), null)
})
