import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GROCERY_INTENTS,
  GROCERY_UTTERANCE_CORPUS,
  isGroceryLikeLanguage,
  parseGroceryLanguage,
} from '../supabase/functions/_shared/assistant-grocery-language.mjs'
import { resolveGrocerySemantic } from '../supabase/functions/_shared/assistant-grocery-semantic.mjs'

const items = [
  { id: 'milk', name: 'Whole Milk', quantity: '1', unit: 'gallon', checked: false, deleted_at: null },
  { id: 'eggs', name: 'Eggs', quantity: null, unit: null, checked: false, deleted_at: null },
  { id: 'old', name: 'Bread', checked: true, deleted_at: null },
]

test('grocery language contract publishes stable intents and generated coverage', () => {
  assert.equal(new Set(GROCERY_INTENTS).size, GROCERY_INTENTS.length)
  assert.ok(GROCERY_UTTERANCE_CORPUS.length >= 60)
  for (const sample of GROCERY_UTTERANCE_CORPUS) {
    assert.equal(parseGroceryLanguage(sample.text)?.intent, sample.intent, sample.text)
  }
})

test('grocery parser handles reads, multi-item adds, and bounded follow-ups', () => {
  assert.equal(parseGroceryLanguage('What is on my grocery list?')?.intent, 'grocery.list')
  assert.deepEqual(parseGroceryLanguage('Add milk, eggs and bananas to my grocery list')?.slots.items, [
    { name: 'milk' },
    { name: 'eggs' },
    { name: 'bananas' },
  ])
  assert.deepEqual(parseGroceryLanguage('Add 2 gallons of milk and two avocados to my grocery list')?.slots.items, [
    { name: 'milk', quantity: '2', unit: 'gallons' },
    { name: 'avocados', quantity: '2' },
  ])
  assert.equal(parseGroceryLanguage('Is coffee on the shopping list?')?.intent, 'grocery.contains')
  assert.equal(parseGroceryLanguage('Do we have coffee?')?.intent, 'grocery.contains')
  assert.deepEqual(
    parseGroceryLanguage('Make that two', { activeEntityType: 'grocery_item' })?.slots,
    { quantity: '2' },
  )
})

test('grocery semantic reads use authoritative active rows', () => {
  const list = resolveGrocerySemantic(parseGroceryLanguage('Read my shopping list'), items)
  assert.match(list.text, /Whole Milk/)
  assert.doesNotMatch(list.text, /Bread/)

  const contains = resolveGrocerySemantic(parseGroceryLanguage('Is eggs on the grocery list?'), items)
  assert.match(contains.text, /eggs is on/i)
})

test('grocery semantic mutations target exact authoritative rows', () => {
  const check = resolveGrocerySemantic(parseGroceryLanguage('Check off eggs'), items)
  assert.deepEqual(check.args, { item_id: 'eggs', checked: true })

  const quantity = resolveGrocerySemantic(
    parseGroceryLanguage('Make that two', { activeEntityType: 'grocery_item' }),
    items,
    { activeItemId: 'milk' },
  )
  assert.deepEqual(quantity.args, { item_id: 'milk', quantity: '2' })
})

test('non-grocery language stays outside the contract', () => {
  for (const text of ['Tell me a joke', 'What is on my calendar?', 'Cook pasta', 'Will it rain?']) {
    assert.equal(parseGroceryLanguage(text), null, text)
  }
  assert.equal(isGroceryLikeLanguage('Please restock coffee'), true)
  assert.equal(isGroceryLikeLanguage('Explain photosynthesis'), false)
})
