import test from 'node:test'
import assert from 'node:assert/strict'
import { notesOf, notesSource, withNotes, sourceTag, notesFromEmail, addNotes } from '../supabase/functions/_shared/event-notes.mjs'

const BLOCK = '<!-- CASA-TABOR-DETAILS:START -->\nTabor House details\nCategory: school\nOpen in Tabor House: https://casa-tabor.vercel.app/calendar?event=1\n<!-- CASA-TABOR-DETAILS:END -->'

// Canvas 65 (Jake, Oct 7): an event's notes are what people wrote — never the details block the app keeps for
// Google, nor its own tags ("Casa · date we keep · birthday", where an email came from).
test('the notes are what people wrote, without the details block or the house’s own tags', () => {
  assert.equal(notesOf(null), '')
  assert.equal(notesOf('Casa · date we keep · birthday'), '')
  assert.equal(notesOf(`Weekly afternoon pickup for Emme.\n\n${BLOCK}`), 'Weekly afternoon pickup for Emme.')
  assert.equal(notesOf(BLOCK), '')
  assert.equal(notesOf('Casa · a step of Christmas lights'), '')
  // A block cut short by Google's length limit still isn't notes.
  assert.equal(notesOf('Bring chairs\n\n<!-- CASA-TABOR-DETAILS:START -->\nTabor House details\nCateg'), 'Bring chairs')
  assert.equal(notesOf('Arrive 12:10\nTabor House · from Coach Rivera’s email · Sep 22 · https://mail.google.com/mail/#all/abc'), 'Arrive 12:10')
})

test('notes written in Google come as plain lines, not its HTML', () => {
  assert.equal(notesOf('Gate code <b>4471</b><br>Park on the left<br/><a href="https://x.co/y">x.co/y</a> &amp; more'), 'Gate code 4471\nPark on the left\nx.co/y & more')
  assert.equal(notesOf('<ul><li>Chairs</li><li>Water</li></ul>'), '• Chairs\n• Water')
  assert.equal(notesOf('one\n\n\n\ntwo'), 'one\n\ntwo')
})

test('saving notes keeps the tags and the details block, and only changes what people wrote', () => {
  const was = `Weekly pickup.\nCasa · date we keep · birthday\n\n${BLOCK}`
  const next = withNotes(was, 'Bring the folding chairs')
  assert.equal(notesOf(next), 'Bring the folding chairs')
  assert.match(next, /Casa · date we keep · birthday/)
  assert.ok(next.endsWith(BLOCK))
  // Cleared: only the tag and the block stay.
  assert.equal(notesOf(withNotes(was, '  ')), '')
  assert.match(withNotes(was, ''), /date we keep/)
  // Nothing at all left: null, as an event with no description.
  assert.equal(withNotes(null, ''), null)
  assert.equal(withNotes('', 'Hi'), 'Hi')
})

test('where the notes came from: an email’s sender, day and link, kept as a tag', () => {
  const tag = sourceTag({ from: 'Coach Rivera <rivera@huskies.org>', receivedAt: '2026-09-22T14:03:00Z', gmailId: 'abc' })
  assert.equal(tag, 'Tabor House · from Coach Rivera’s email · Sep 22 · https://mail.google.com/mail/#all/abc')
  const desc = withNotes(tag, 'Arrive 12:10')
  assert.deepEqual(notesSource(desc), { text: 'From Coach Rivera’s email · Sep 22', url: 'https://mail.google.com/mail/#all/abc' })
  assert.equal(notesOf(desc), 'Arrive 12:10')
  // A sender with only an address: the part before the @, a name.
  assert.equal(sourceTag({ from: 'photo@walgreens.com', receivedAt: '2026-09-24T12:00:00Z' }), 'Tabor House · from Walgreens’s email · Sep 24')
  assert.equal(notesSource('Bring chairs'), null)
})

test('an email’s notes: one line each, bulleted, the source underneath', () => {
  const d = notesFromEmail(['Arrive by 12:10 for warm-ups', '  ', '$5 cash per adult at the gate'], { from: 'Coach Rivera <r@x.org>', receivedAt: '2026-09-22T14:03:00Z' })
  assert.equal(notesOf(d), '• Arrive by 12:10 for warm-ups\n• $5 cash per adult at the gate')
  assert.equal(notesSource(d).text, 'From Coach Rivera’s email · Sep 22')
  assert.equal(notesFromEmail([], { from: 'a@b.c' }), null)
})

test('adding to the notes: new lines under what’s there, never the same line twice', () => {
  const was = `Bring chairs\n\n${BLOCK}`
  const next = addNotes(was, ['Gate opens 11:45', 'Bring chairs'])
  assert.equal(notesOf(next), 'Bring chairs\nGate opens 11:45')
  assert.ok(next.endsWith(BLOCK))
  assert.equal(notesOf(addNotes(null, ['First line'])), 'First line')
  assert.equal(addNotes('Same', ['same']), 'Same')
})
