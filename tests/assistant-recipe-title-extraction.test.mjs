import assert from 'node:assert/strict'
import test from 'node:test'
import { extractMealTitle } from '../src/lib/assistantRecipeExtractor.mjs'

test('extracts title when message has conversational introduction framing before recipe name', () => {
  const message = `Okay, how about this title for the recipe:

Quick & Easy Pan-Seared Tilapia with Herbed Rice and Green Beans

Does that sound better?`

  assert.equal(
    extractMealTitle(message),
    'Quick & Easy Pan-Seared Tilapia with Herbed Rice and Green Beans'
  )
})

test('extracts bold markdown titles longer than 50 characters', () => {
  const message = `Here is your recipe idea:

**Quick & Easy Pan-Seared Tilapia with Herbed Rice and Green Beans**

### Ingredients
- 4 tilapia fillets`

  assert.equal(
    extractMealTitle(message),
    'Quick & Easy Pan-Seared Tilapia with Herbed Rice and Green Beans'
  )
})

test('extracts markdown H1/H2 header titles', () => {
  const message = `# Creamy Garlic Butter Salmon with Spinach

Serves: 4
Prep time: 10 mins`

  assert.equal(
    extractMealTitle(message),
    'Creamy Garlic Butter Salmon with Spinach'
  )
})

test('extracts titles with explicit Title: prefix', () => {
  const message = `Title: Roasted Lemon Herb Chicken with Garlic Vegetables

Ingredients:
- Chicken thighs`

  assert.equal(
    extractMealTitle(message),
    'Roasted Lemon Herb Chicken with Garlic Vegetables'
  )
})

test('ignores trailing question lines and conversational intro lines', () => {
  const message = `Here's a great dinner idea for tonight:

Lemon Garlic Pan-Seared Tilapia

What do you think?`

  assert.equal(
    extractMealTitle(message),
    'Lemon Garlic Pan-Seared Tilapia'
  )
})

test('extracts bold recipe title in sentence recommendation with cook time mention', () => {
  const message = `Based on your pantry and preferences for a pescatarian diet, I recommend the **Quick Salmon Power Bowls** recipe.

It uses salmon, olive oil, garlic powder, paprika, salt, pepper, cooked brown rice, mixed greens, cucumber, shelled edamame, shredded carrots, avocado, mayonnaise, sriracha, and lime juice.

You have many of these ingredients on hand, and it's designed for 2 servings with a cook time of 45 minutes.

Would you like me to list the ingredients you'd need to pick up for this recipe, or tell you how to make it?`

  assert.equal(
    extractMealTitle(message),
    'Quick Salmon Power Bowls'
  )
})

test('falls back to default title when content contains no recognizable title', () => {
  const message = `Hello there! How can I help you today?`

  assert.equal(
    extractMealTitle(message),
    'Simple Pasta Dish'
  )
})
