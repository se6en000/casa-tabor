import test from 'node:test'
import assert from 'node:assert/strict'
import { withAddedGrocery } from '../src/lib/groceryOptimistic.ts'

// Groceries added show at once; the next fetch replaces the stand-in with the saved one.
test('an added grocery is on the list at once, once', () => {
  const old = { lists: [{ id: 'l1' }], items: [{ id: 'm', name: 'Milk', checked: false }] }
  const next = withAddedGrocery(old, { list_id: 'l1', name: '  Paper  towels ', quantity: null, unit: null, category: 'household' }, 'adding-1')
  assert.deepEqual(next.items.map((i) => [i.id, i.name, i.category, i.checked]), [['m', 'Milk', undefined, false], ['adding-1', 'Paper towels', 'household', false]])
  assert.equal(withAddedGrocery(old, { list_id: 'l1', name: 'milk', quantity: null, unit: null, category: 'dairy' }, 'adding-2'), old)
  assert.equal(withAddedGrocery(undefined, { list_id: 'l1', name: 'x', quantity: null, unit: null, category: 'other' }, 'a'), undefined)
})
