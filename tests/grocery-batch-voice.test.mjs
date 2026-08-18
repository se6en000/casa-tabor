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

test('parseGroceryVoiceBatch handles unpunctuated continuous speech lists (user case)', () => {
  // Case from user: "hamberburgers hamberger buns hot dogs hot dog buns"
  const utterance1 = 'hamberburgers hamberger buns hot dogs hot dog buns'
  const items1 = parseGroceryVoiceBatch(utterance1)

  assert.equal(items1.length, 4)
  assert.equal(items1[0].name, 'Hamburgers')
  assert.equal(items1[0].category, 'meat')
  assert.equal(items1[1].name, 'Hamburger Buns')
  assert.equal(items1[1].category, 'bakery')
  assert.equal(items1[2].name, 'Hot Dogs')
  assert.equal(items1[2].category, 'meat')
  assert.equal(items1[3].name, 'Hot Dog Buns')
  assert.equal(items1[3].category, 'bakery')

  // Case: single compound item "apple juice" is preserved as 1 item
  const items2 = parseGroceryVoiceBatch('apple juice')
  assert.equal(items2.length, 1)
  assert.equal(items2[0].name, 'Apple Juice')
  assert.equal(items2[0].category, 'beverages')

  // Case: continuous list of compound items
  const items3 = parseGroceryVoiceBatch('apple juice sourdough bread cold brew')
  assert.equal(items3.length, 3)
  assert.equal(items3[0].name, 'Apple Juice')
  assert.equal(items3[1].name, 'Sourdough Bread')
  assert.equal(items3[2].name, 'Cold Brew')

  // Case: continuous list of single staples
  const items4 = parseGroceryVoiceBatch('milk eggs cheese bread butter')
  assert.equal(items4.length, 5)
  assert.equal(items4[0].name, 'Milk')
  assert.equal(items4[1].name, 'Eggs')
  assert.equal(items4[2].name, 'Cheese')
  assert.equal(items4[3].name, 'Bread')
  assert.equal(items4[4].name, 'Butter')

  // Case: mixed quantities and compound items without commas
  const items5 = parseGroceryVoiceBatch('2 gallons whole milk 3 avocados 1 loaf sourdough bread')
  assert.equal(items5.length, 3)
  assert.equal(items5[0].name, 'Whole Milk')
  assert.equal(items5[0].quantity, '2')
  assert.equal(items5[0].unit, 'gallons')
  assert.equal(items5[1].name, 'Avocados')
  assert.equal(items5[1].quantity, '3')
  assert.equal(items5[2].name, 'Sourdough Bread')
  assert.equal(items5[2].quantity, '1')
  assert.equal(items5[2].unit, 'loaf')
})
