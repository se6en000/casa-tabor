import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSingleVoiceItem,
  parseGroceryVoiceBatch,
} from '../src/utils/groceryBatchVoiceParser.ts'

test('parseSingleVoiceItem extracts quantities, units, and categories', () => {
  // Number word + unit + name
  const item1 = parseSingleVoiceItem('two gallons of whole milk')
  assert.ok(item1)
  assert.equal(item1.name, 'Whole Milk')
  assert.equal(item1.quantity, '2')
  assert.equal(item1.unit, 'gallons')
  assert.equal(item1.category, 'dairy')

  // Numeric + unit + name
  const item2 = parseSingleVoiceItem('3 lbs organic chicken breast')
  assert.ok(item2)
  assert.equal(item2.name, 'Organic Chicken Breast')
  assert.equal(item2.quantity, '3')
  assert.equal(item2.unit, 'lbs')
  assert.equal(item2.category, 'meat')

  // Number only + name
  const item3 = parseSingleVoiceItem('three ripe avocados')
  assert.ok(item3)
  assert.equal(item3.name, 'Ripe Avocados')
  assert.equal(item3.quantity, '3')
  assert.equal(item3.unit, null)
  assert.equal(item3.category, 'produce')

  // Simple name
  const item4 = parseSingleVoiceItem('sourdough bread')
  assert.ok(item4)
  assert.equal(item4.name, 'Sourdough Bread')
  assert.equal(item4.quantity, null)
  assert.equal(item4.unit, null)
  assert.equal(item4.category, 'bakery')
})

test('parseGroceryVoiceBatch parses compound lists and strips conversational prefixes', () => {
  const utterance = 'Hey Casa, please add 2 gallons of whole milk, sourdough bread, and 3 avocados to my grocery list'
  const items = parseGroceryVoiceBatch(utterance)

  assert.equal(items.length, 3)
  assert.equal(items[0].name, 'Whole Milk')
  assert.equal(items[0].quantity, '2')
  assert.equal(items[0].unit, 'gallons')
  assert.equal(items[0].category, 'dairy')

  assert.equal(items[1].name, 'Sourdough Bread')
  assert.equal(items[1].quantity, null)
  assert.equal(items[1].category, 'bakery')

  assert.equal(items[2].name, 'Avocados')
  assert.equal(items[2].quantity, '3')
  assert.equal(items[2].category, 'produce')
})

test('parseGroceryVoiceBatch handles conjunctions without commas', () => {
  const utterance = 'we need eggs and butter plus fresh basil'
  const items = parseGroceryVoiceBatch(utterance)

  assert.equal(items.length, 3)
  assert.equal(items[0].name, 'Eggs')
  assert.equal(items[1].name, 'Butter')
  assert.equal(items[2].name, 'Fresh Basil')
})

test('parseGroceryVoiceBatch ignores empty input', () => {
  assert.deepEqual(parseGroceryVoiceBatch(''), [])
  assert.deepEqual(parseGroceryVoiceBatch('   '), [])
  assert.deepEqual(parseGroceryVoiceBatch('please add to my list'), [])
})
