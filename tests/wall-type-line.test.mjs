import test from 'node:test'
import assert from 'node:assert/strict'
import { typedTurn, readableFiles, typingInAField, startsQuickAsk, MAX_IMAGES } from '../src/wall/typeLine.ts'

// Canvas row 22 (Jake, 2026-10-01, approved): typing and pasting into Casa on a computer.
const pic = (n) => ({ dataUrl: `data:image/png;base64,${n}`, mimeType: 'image/png', name: `${n}.png` })

test('a send: the words, trimmed; pictures alone ask what is in them', () => {
  assert.equal(typedTurn('   ', []), null)
  assert.deepEqual(typedTurn('  add this to Owen’s field trip \n', []), { text: 'add this to Owen’s field trip', images: [] })
  assert.equal(typedTurn('', [pic(1)]).text, 'What’s in this?')
  assert.equal(typedTurn('', [pic(1), pic(2)]).text, 'What’s in these?')
  assert.equal(typedTurn('what do we need from these', [pic(1), pic(2)]).images.length, 2)
})

test('several pictures at once, up to the limit; only pictures and PDFs', () => {
  const files = [{ type: 'image/png' }, { type: 'text/plain' }, { type: 'application/pdf' }, { type: 'image/jpeg' }]
  assert.deepEqual(readableFiles(files).map((f) => f.type), ['image/png', 'application/pdf', 'image/jpeg'])
  assert.equal(readableFiles(Array.from({ length: 10 }, () => ({ type: 'image/png' }))).length, MAX_IMAGES)
})

test('the quick line starts on a plain key, never while typing in a field or on a shortcut', () => {
  assert.equal(startsQuickAsk({ key: 'i' }), true)
  assert.equal(startsQuickAsk({ key: 'I' }), true)
  assert.equal(startsQuickAsk({ key: 'v', metaKey: true }), false)
  assert.equal(startsQuickAsk({ key: 'Escape' }), false)
  assert.equal(startsQuickAsk({ key: ' ' }), false)
  assert.equal(typingInAField({ tagName: 'input' }), true)
  assert.equal(typingInAField({ tagName: 'TEXTAREA' }), true)
  assert.equal(typingInAField({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(typingInAField({ tagName: 'BUTTON' }), false)
  assert.equal(typingInAField(null), false)
})
