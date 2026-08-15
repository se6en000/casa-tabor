import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const livingSidecar = readFileSync(
  new URL('../src/components/calendar/living-flow/LivingFlowSidecar.tsx', import.meta.url),
  'utf8',
)
const titleCard = readFileSync(
  new URL('../src/components/calendar/living-flow/components/LivingHeroTitleCard.tsx', import.meta.url),
  'utf8',
)
const editSource = readFileSync(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)

test('Living Flow supports in-place title, time, and category inline editing', () => {
  assert.match(titleCard, /contentEditable/)
  assert.match(titleCard, /onUpdateTitle/)
  assert.match(titleCard, /onSetStartAndDuration/)
  assert.match(titleCard, /onSelectCategory/)
})

test('the editor supports sheet presentation', () => {
  assert.match(editSource, /presentation\?: 'sheet' \| 'inline'/)
})
