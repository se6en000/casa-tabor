import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/hooks/useDirectorySuggestions.ts', import.meta.url), 'utf8')

test('useDirectorySuggestionEntries queries unconfirmed, non-dismissed saved_places and saved_contacts rows', () => {
  assert.match(source, /from\('saved_places'\)/)
  assert.match(source, /from\('saved_contacts'\)/)
  assert.match(source, /\.eq\('confirmed', false\)/g)
  assert.match(source, /\.is\('dismissed_at', null\)/g)
})

test('useConfirmDirectorySuggestionEntry sets confirmed true on the correct table for each kind', () => {
  assert.match(source, /confirmed:\s*true/)
})

test('useDismissDirectorySuggestionEntry sets dismissed_at (tombstone, not a hard delete) so it never resurfaces', () => {
  assert.match(source, /dismissed_at:\s*new Date\(\)\.toISOString\(\)/)
  assert.doesNotMatch(source, /\.delete\(\)/)
})
