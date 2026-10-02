import test from 'node:test'
import assert from 'node:assert/strict'
import { aisles, amountOf, planAdds, usuals } from '../src/phone/groceries.ts'

// Canvas 33d/33e (Jake, Oct 2): Groceries for the store — by aisle, the amount by the name, ticks that wait, add a few at once.
const item = (id, name, category, extra = {}) => ({ id, name, category, quantity: null, unit: null, checked: false, ...extra })

test('aisles run in store order with plain names; ticked items leave unless they were just ticked', () => {
  const items = [
    item('milk', 'Milk', 'dairy'),
    item('ban', 'Bananas', 'produce'),
    item('av', 'Avocados', 'produce', { quantity: '3' }),
    item('dog', 'Dog food', 'pet'),
    item('eggs', 'Eggs', 'dairy', { checked: true }),
    item('bread', 'Bread', 'bakery', { checked: true }),
    item('odd', 'Something', 'not-a-key'),
  ]
  const { groups, done } = aisles(items, new Set(['eggs']))
  assert.deepEqual(groups.map((g) => g.label), ['PRODUCE', 'DAIRY & EGGS', 'PET', 'OTHER'])
  assert.deepEqual(groups[0].items.map((i) => i.id), ['av', 'ban'])
  // Eggs was just ticked: it stays where it was, ticked, until the pause.
  assert.deepEqual(groups[1].items.map((i) => i.id), ['eggs', 'milk'])
  assert.deepEqual(done.map((i) => i.id), ['bread'])
  assert.deepEqual(groups[3].items.map((i) => i.id), ['odd'])
})

test('the amount reads as people say it, next to the name', () => {
  assert.equal(amountOf(item('a', 'Avocados', 'produce', { quantity: '3' })), '3')
  assert.equal(amountOf(item('m', 'Milk', 'dairy', { quantity: '1', unit: 'gallon' })), '1 gallon')
  assert.equal(amountOf(item('b', 'Butter', 'dairy', { quantity: '1' })), '')
  assert.equal(amountOf(item('c', 'Coffee', 'pantry')), '')
})

test('a few at once: each lands in its aisle; what is on the list already is not doubled, a ticked one comes back', () => {
  const items = [item('milk', 'Milk', 'dairy'), item('lime', 'Limes', 'produce', { checked: true })]
  const plan = planAdds('paper towels, 2 limes and milk', items)
  assert.deepEqual(plan.map((p) => p.kind), ['new', 'again', 'already'])
  assert.equal(plan[0].name.toLowerCase(), 'paper towels')
  assert.equal(plan[0].category, 'household')
  assert.equal(plan[1].id, 'lime')
  assert.equal(plan[2].id, 'milk')
  assert.deepEqual(planAdds('   ', items), [])
  // However it's written: "milk" is the "Milk, 2%" on the list; "chocolate milk" is something else.
  const written = [item('m2', 'Milk, 2%', 'dairy')]
  assert.deepEqual(planAdds('milk', written).map((p) => p.kind), ['already'])
  assert.deepEqual(planAdds('chocolate milk', written).map((p) => p.kind), ['new'])
  // Said as a run-on list, it's split: "hot dogs hot dog buns" is two.
  assert.equal(planAdds('hot dogs hot dog buns', [], { spoken: true }).length, 2)
})

test('usual items: the most bought, not what is already on the list', () => {
  const history = ['Milk', 'milk', 'Eggs', 'Bananas', 'Eggs', 'Milk', 'Bread', 'eggs']
  assert.deepEqual(usuals(history, [item('b', 'Bananas', 'produce')], 3), ['Milk', 'Eggs', 'Bread'])
})
