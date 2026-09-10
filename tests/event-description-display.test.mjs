import assert from 'node:assert/strict'
import test from 'node:test'

import { getEventDisplayDescription } from '../src/utils/eventDescription.ts'

test('getEventDisplayDescription strips the Casa details block, keeping the human text before it', () => {
  const description = [
    'Weekly afternoon strings pickup at Palm Beach Public Elementary School.',
    '<!-- CASA-TABOR-DETAILS:START -->',
    'Casa Tabor details',
    'People: Emme',
    'Open in Casa: https://casa-tabor.vercel.app/calendar?event=c30a186b-becb-4c44-9a67-000000000000',
    '<!-- CASA-TABOR-DETAILS:END -->',
  ].join('\n')

  assert.equal(
    getEventDisplayDescription(description),
    'Weekly afternoon strings pickup at Palm Beach Public Elementary School.',
  )
})

test('getEventDisplayDescription returns an empty string when the description is only the Casa block', () => {
  const description = '<!-- CASA-TABOR-DETAILS:START -->\nCasa Tabor details\n<!-- CASA-TABOR-DETAILS:END -->'
  assert.equal(getEventDisplayDescription(description), '')
})

test('getEventDisplayDescription leaves a plain description with no Casa block untouched', () => {
  assert.equal(getEventDisplayDescription('Bring cleats and shin guards.'), 'Bring cleats and shin guards.')
})

test('getEventDisplayDescription handles a malformed block (start marker with no end marker) by leaving text as-is', () => {
  const description = 'Notes.\n<!-- CASA-TABOR-DETAILS:START -->\nunterminated'
  assert.equal(getEventDisplayDescription(description), description)
})

test('getEventDisplayDescription returns an empty string for null/undefined/blank input', () => {
  assert.equal(getEventDisplayDescription(null), '')
  assert.equal(getEventDisplayDescription(undefined), '')
  assert.equal(getEventDisplayDescription('   '), '')
})
