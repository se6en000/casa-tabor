import assert from 'node:assert/strict'
import test from 'node:test'

import { whatToBringToChecklistRows } from '../src/lib/checklistMigration.ts'

test('whatToBringToChecklistRows returns empty array for null/undefined/non-array input', () => {
  assert.deepEqual(whatToBringToChecklistRows(null), [])
  assert.deepEqual(whatToBringToChecklistRows(undefined), [])
  assert.deepEqual(whatToBringToChecklistRows([]), [])
})

test('whatToBringToChecklistRows converts a single item to one unchecked row', () => {
  assert.deepEqual(whatToBringToChecklistRows(['Shin guards']), [
    { label: 'Shin guards', checked: false, sort_order: 0 },
  ])
})

test('whatToBringToChecklistRows converts multiple items preserving order', () => {
  assert.deepEqual(whatToBringToChecklistRows(['Shin guards', 'Water bottle', 'Cleats']), [
    { label: 'Shin guards', checked: false, sort_order: 0 },
    { label: 'Water bottle', checked: false, sort_order: 1 },
    { label: 'Cleats', checked: false, sort_order: 2 },
  ])
})

test('whatToBringToChecklistRows drops blank/whitespace-only entries without gapping sort_order', () => {
  assert.deepEqual(whatToBringToChecklistRows(['Shin guards', '  ', '', 'Water bottle']), [
    { label: 'Shin guards', checked: false, sort_order: 0 },
    { label: 'Water bottle', checked: false, sort_order: 1 },
  ])
})

test('whatToBringToChecklistRows trims surrounding whitespace on each label', () => {
  assert.deepEqual(whatToBringToChecklistRows(['  Shin guards  ']), [
    { label: 'Shin guards', checked: false, sort_order: 0 },
  ])
})
