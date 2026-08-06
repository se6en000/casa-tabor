import assert from 'node:assert/strict'
import test from 'node:test'

import { toDirectorySuggestionEntries } from '../src/utils/directorySuggestionEntries.ts'

const place = (overrides = {}) => ({
  id: 'place-1',
  name: 'Hope Center for Behavior Change',
  category: 'medical',
  occurrence_count: 3,
  created_at: '2026-08-01T00:00:00.000Z',
  confirmed: false,
  dismissed_at: null,
  ...overrides,
})

const contact = (overrides = {}) => ({
  id: 'contact-1',
  name: "Maria (Emme's piano teacher)",
  relationship: null,
  occurrence_count: 1,
  created_at: '2026-08-02T00:00:00.000Z',
  confirmed: false,
  dismissed_at: null,
  ...overrides,
})

test('toDirectorySuggestionEntries tags each row with its kind and a real id', () => {
  const entries = toDirectorySuggestionEntries([place()], [contact()])
  assert.equal(entries.length, 2)
  assert.equal(entries.find((e) => e.kind === 'place')?.id, 'place-1')
  assert.equal(entries.find((e) => e.kind === 'contact')?.id, 'contact-1')
})

test('toDirectorySuggestionEntries maps a saved place category to a human label', () => {
  const entries = toDirectorySuggestionEntries([place({ category: 'medical' })], [])
  assert.equal(entries[0].categoryLabel, 'Medical')
})

test('toDirectorySuggestionEntries labels contacts generically as Contact', () => {
  const entries = toDirectorySuggestionEntries([], [contact()])
  assert.equal(entries[0].categoryLabel, 'Contact')
})

test('toDirectorySuggestionEntries sorts by occurrence_count descending, then recency', () => {
  const entries = toDirectorySuggestionEntries(
    [place({ id: 'p-low', occurrence_count: 1, created_at: '2026-08-01T00:00:00.000Z' })],
    [contact({ id: 'c-high', occurrence_count: 5, created_at: '2026-08-02T00:00:00.000Z' })],
  )
  assert.deepEqual(entries.map((e) => e.id), ['c-high', 'p-low'])
})

test('toDirectorySuggestionEntries respects an optional limit', () => {
  const places = [place({ id: 'p1' }), place({ id: 'p2' }), place({ id: 'p3' })]
  const entries = toDirectorySuggestionEntries(places, [], 2)
  assert.equal(entries.length, 2)
})
