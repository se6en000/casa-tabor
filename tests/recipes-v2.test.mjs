import test from 'node:test'
import assert from 'node:assert/strict'
import { amountFor, servingChoices, stepTimers, cookMinutes, cookTime, searchRecipes, chipFilter, sortRecipes, madeLine, scaleAmount } from '../src/recipes/model.ts'

// Recipes V2 (canvas row 49; Jake, Oct 6: "look up meals/recipes easily, keep track of the ones I cook often (mark as
// favorites) … a cooking experience on both the wall and more importantly my phone/tablet").

test('a recipe card’s two amounts: “10 oz | 20 oz Shrimp” is 10 oz for 2 and 20 oz for 4, tidied', () => {
  assert.equal(amountFor('10 oz | 20 oz Shrimp', 0), '10 oz Shrimp')
  assert.equal(amountFor('10 oz | 20 oz Shrimp', 1), '20 oz Shrimp')
  assert.equal(amountFor('2 Clove(s) | 4 Clove(s) Garlic', 0), '2 cloves Garlic')
  assert.equal(amountFor('1 Clove(s) | 2 Clove(s) Garlic', 0), '1 clove Garlic')
  assert.equal(amountFor('3 TBSP | 6 TBSP Parmesan Cheese', 1), '6 tbsp Parmesan Cheese')
  assert.equal(amountFor('1 | 2 Seafood Stock Concentrate', 1), '2 Seafood Stock Concentrate')
  assert.equal(amountFor('1/2 Broccoli', 1), '1/2 Broccoli')
  assert.equal(amountFor('1 tsp | 1 tsp Chili Flakes', 0), '1 tsp Chili Flakes')
})

test('who it serves: the card’s choices, or as written and doubled', () => {
  assert.deepEqual(servingChoices('2 Person | 4 Person'), [{ label: '2', variant: 0, factor: 1 }, { label: '4', variant: 1, factor: 1 }])
  assert.deepEqual(servingChoices('2'), [{ label: '2', variant: 0, factor: 1 }, { label: '4', variant: 0, factor: 2 }])
  assert.deepEqual(servingChoices('2-3'), [{ label: '2–3', variant: 0, factor: 1 }, { label: '4–6', variant: 0, factor: 2 }])
  assert.deepEqual(servingChoices('2 (HUGE servings)'), [{ label: '2', variant: 0, factor: 1 }, { label: '4', variant: 0, factor: 2 }])
  assert.deepEqual(servingChoices(null), [{ label: 'As written', variant: 0, factor: 1 }, { label: 'Doubled', variant: 0, factor: 2 }])
})

test('doubling an amount: whole numbers, fractions, ranges; words left alone', () => {
  assert.equal(scaleAmount('10 oz Shrimp', 2), '20 oz Shrimp')
  assert.equal(scaleAmount('1/2 cup Parmesan', 2), '1 cup Parmesan')
  assert.equal(scaleAmount('½ head broccoli', 2), '1 head broccoli')
  assert.equal(scaleAmount('1 1/2 cups rice', 2), '3 cups rice')
  assert.equal(scaleAmount('2-3 cloves garlic', 2), '4–6 cloves garlic')
  assert.equal(scaleAmount('0.5 lb salmon', 2), '1 lb salmon')
  assert.equal(scaleAmount('Salt and pepper', 2), 'Salt and pepper')
  assert.equal(scaleAmount('10 oz Shrimp', 1), '10 oz Shrimp')
})

test('a step’s own times become timers (the low end first)', () => {
  assert.deepEqual(stepTimers('Roast on top rack until browned and crispy, 12- 15 minutes.'), [{ label: '12–15 min', seconds: 720 }])
  assert.deepEqual(stepTimers('Cook, stirring occasionally, until al dente, 9-11 minutes.'), [{ label: '9–11 min', seconds: 540 }])
  assert.deepEqual(stepTimers('Microwave until just softened, 10 seconds.'), [{ label: '10 sec', seconds: 10 }])
  assert.deepEqual(stepTimers('Simmer 1 hour, then rest 5 mins.'), [{ label: '1 hr', seconds: 3600 }, { label: '5 min', seconds: 300 }])
  assert.deepEqual(stepTimers('Cut broccoli into 1-inch pieces.'), [])
  assert.deepEqual(stepTimers('Heat a pan over medium-high heat, 2 to 4 minutes.'), [{ label: '2–4 min', seconds: 120 }])
})

test('cook time in a few words, and as minutes for Quick', () => {
  assert.equal(cookTime('30 Minutes'), '30 min')
  assert.equal(cookTime('20-25 minutes'), '20–25 min')
  assert.equal(cookTime('1 hour 15 minutes'), '1 hr 15 min')
  assert.equal(cookTime(null), null)
  assert.equal(cookMinutes('20-25 minutes'), 25)
  assert.equal(cookMinutes('45 minutes'), 45)
  assert.equal(cookMinutes('1 hour'), 60)
  assert.equal(cookMinutes(null), null)
})

const now = new Date('2026-10-06T12:00:00')
const R = [
  { id: 'a', name: 'Garlic Butter Shrimp Scampi', cook_time: '30 Minutes', last_used_at: '2026-08-14T12:00:00Z', favorite: true, cooked_count: 3, ingredients: ['10 oz | 20 oz Shrimp', '6 oz | 12 oz Spaghetti'] },
  { id: 'b', name: 'Quick Salmon Power Bowls', cook_time: '45 minutes', last_used_at: '2026-07-15T12:00:00Z', favorite: false, cooked_count: 0, ingredients: ['Salmon', 'Rice'] },
  { id: 'c', name: 'Shrimp and Broccoli Stir Fry', cook_time: '25 minutes', last_used_at: '2026-09-07T12:00:00Z', favorite: false, cooked_count: 1, ingredients: ['Shrimp', 'Broccoli'] },
  { id: 'd', name: 'Matcha Mojito', cook_time: null, last_used_at: null, favorite: false, cooked_count: 0, ingredients: ['Matcha'] },
]

test('search finds a recipe by its name or by what’s in it, every word', () => {
  assert.deepEqual(searchRecipes(R, 'shrimp').map((r) => r.id), ['a', 'c'])
  assert.deepEqual(searchRecipes(R, 'spaghetti').map((r) => r.id), ['a'])
  assert.deepEqual(searchRecipes(R, 'salmon rice').map((r) => r.id), ['b'])
  assert.deepEqual(searchRecipes(R, '  ').map((r) => r.id), ['a', 'b', 'c', 'd'])
})

test('the chips: Favorites, Quick (30 min or less), Not made lately (two months), All', () => {
  assert.deepEqual(chipFilter(R, 'favorites', now).map((r) => r.id), ['a'])
  assert.deepEqual(chipFilter(R, 'quick', now).map((r) => r.id), ['a', 'c'])
  assert.deepEqual(chipFilter(R, 'lately', now).map((r) => r.id), ['b', 'd'])
  assert.equal(chipFilter(R, 'all', now).length, 4)
})

test('the photo wall’s order: favorites, then the most recently made, then never made', () => {
  assert.deepEqual(sortRecipes(R).map((r) => r.id), ['a', 'c', 'b', 'd'])
})

test('under each photo: how long, and when it was last made (and how often, once counted)', () => {
  assert.equal(madeLine(R[0], now), '30 min · made 3 times · last Aug 14')
  assert.equal(madeLine(R[2], now), '25 min · made Sep 7')
  assert.equal(madeLine(R[3], now), 'Not made yet')
  assert.equal(madeLine({ ...R[2], last_used_at: '2026-10-06T09:00:00' }, now), '25 min · made today')
})

test('cooking: the ingredients a step uses, by name', async () => {
  const { stepUses } = await import('../src/recipes/model.ts')
  const lines = ['10 oz | 20 oz Shrimp', '2 Clove(s) | 4 Clove(s) Garlic', '3 TBSP | 6 TBSP Parmesan Cheese', '1/2 Broccoli', '1 tsp | 1 tsp Chili Flakes', '6 oz | 12 oz Spaghetti', '1 | 2 Seafood Stock Concentrate', '1 | 2 Lemon']
  assert.deepEqual(stepUses('Once water is boiling, add spaghetti to pot. Cook until al dente, 9-11 minutes.', lines), [5])
  assert.deepEqual(stepUses('Add lemon zest, half the Parmesan, a pinch of garlic, and a pinch of chili flakes.', lines), [1, 2, 4, 7])
  assert.deepEqual(stepUses('To pan with shrimp, add drained spaghetti, broccoli, stock concentrate, garlic butter.', lines), [0, 1, 3, 5, 6])
  assert.deepEqual(stepUses('Wash and dry produce.', lines), [])
})

test('groceries: salt, pepper, oil and water start unticked; a bell pepper doesn’t', async () => {
  const { likelyHave } = await import('../src/recipes/model.ts')
  for (const line of ['Salt and pepper', 'Kosher salt', '2 tbsp olive oil', '1 cup water', 'Black pepper', 'Cooking spray']) assert.equal(likelyHave(line), true, line)
  for (const line of ['1 red bell pepper', '1 jalapeño pepper', '10 oz shrimp', 'Saltines', '1 lemon']) assert.equal(likelyHave(line), false, line)
})
