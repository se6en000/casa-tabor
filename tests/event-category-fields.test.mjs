import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/components/calendar/categoryFields.ts', import.meta.url),
  'utf8',
)

test('Child Care is available with caregiving-specific enrichment fields', () => {
  assert.match(source, /child_care:\s+\['what_to_bring', 'dietary_notes', 'contact_name', 'contact_phone', 'cost_estimate', 'prep_notes'\]/)
  assert.match(source, /child_care: 'Child Care'/)
})
