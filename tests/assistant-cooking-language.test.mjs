import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  COOKING_INTENTS,
  COOKING_UTTERANCE_CORPUS,
  cookingFrameGuidance,
  isCookingLikeLanguage,
  parseCookingLanguage,
} from '../supabase/functions/_shared/assistant-cooking-language.mjs'
import {
  cookingPolicyGuidance,
  cookingToolNames,
  formatAuthoritativeRecipes,
  validateCookingGroceryItems,
} from '../supabase/functions/_shared/assistant-cooking-policy.mjs'

test('cooking language contract publishes stable concepts and generated coverage', () => {
  assert.equal(COOKING_INTENTS.length, 23)
  assert.equal(new Set(COOKING_INTENTS).size, COOKING_INTENTS.length)
  assert.ok(COOKING_UTTERANCE_CORPUS.length >= 80)
  for (const sample of COOKING_UTTERANCE_CORPUS) {
    const options = ['cooking.next_step', 'cooking.repeat_step'].includes(sample.intent)
      ? { assistantMode: 'chef' }
      : {}
    assert.equal(parseCookingLanguage(sample.text, options)?.intent, sample.intent, sample.text)
  }
})

test('chef mode recognizes a singular dish-planning request as a recipe', () => {
  const frame = parseCookingLanguage(
    'Plan a salmon rice bowl for four. I already have salmon and rice.',
    { assistantMode: 'chef' },
  )
  assert.equal(frame?.intent, 'cooking.recipe')
  assert.equal(frame?.slots.recipe, 'salmon rice bowl')
})

test('cooking parser extracts useful open-class slots', () => {
  assert.deepEqual(parseCookingLanguage('How do I make chicken tacos?')?.slots, { recipe: 'chicken tacos' })
  assert.deepEqual(parseCookingLanguage('What can I make with salmon and rice?')?.slots, { ingredients: 'salmon and rice' })
  assert.equal(parseCookingLanguage('What can I use instead of buttermilk?')?.slots.ingredient, 'buttermilk')
})

test('detailed cooking instructions stay on the cooking lane despite temperature language', () => {
  assert.equal(
    parseCookingLanguage('Explain how to pan sear salmon, including pan temperature and food safety.')?.intent,
    'cooking.technique',
  )
  assert.equal(
    parseCookingLanguage('Walk me through how to cook a thick fish fillet.')?.intent,
    'cooking.technique',
  )
})

test('cooking follow-ups require cooking context', () => {
  assert.equal(parseCookingLanguage('What do I do next?'), null)
  assert.equal(parseCookingLanguage('What do I do next?', { assistantMode: 'chef' })?.intent, 'cooking.next_step')
  assert.equal(parseCookingLanguage('Say that step again')?.intent, 'cooking.repeat_step')
})

test('explicit cooking grocery handoff is narrow and confirmation-safe', () => {
  const frame = parseCookingLanguage(
    'Add the missing ingredients to my grocery list',
    { assistantMode: 'chef' },
  )
  assert.equal(frame?.intent, 'cooking.add_to_grocery')
  assert.deepEqual(cookingToolNames(frame), ['add_grocery_items'])
  assert.deepEqual(cookingToolNames(parseCookingLanguage('What ingredients am I missing?')), [])
  assert.match(cookingFrameGuidance(frame), /exactly once/)
  assert.equal(
    parseCookingLanguage(
      'Add only the missing broccoli and soy sauce to my grocery list. Do not add salmon or rice.',
      { assistantMode: 'chef' },
    )?.intent,
    'cooking.add_to_grocery',
  )
})

test('copied smart-quoted missing-ingredient requests stay read-only', () => {
  const frame = parseCookingLanguage(
    '“I’m making salmon rice bowls. I have salmon and rice, but I need broccoli and soy sauce. What am I missing? Don’t change my grocery list.”',
  )
  assert.equal(frame?.intent, 'cooking.missing_ingredients')
  assert.deepEqual(frame?.slots, { explicitMissing: 'broccoli and soy sauce' })
  assert.deepEqual(cookingToolNames(frame), [])
  assert.match(cookingFrameGuidance(frame), /only the explicitly identified missing items/)
  assert.match(cookingFrameGuidance(frame), /broccoli and soy sauce/)
})

test('recipe generation guidance is explicitly read-only Markdown', () => {
  const guidance = cookingFrameGuidance(
    parseCookingLanguage('How do I make salmon bowls?', { assistantMode: 'chef' }),
  )
  assert.match(guidance, /readable Markdown/)
  assert.match(guidance, /do not call create_recipe/)
  assert.match(guidance, /do not .*use code fences/i)
})

test('cooking policy makes household allergies authoritative', () => {
  const policy = cookingPolicyGuidance(
    parseCookingLanguage('What can I use instead of buttermilk?'),
    {
      allergies: 'peanuts; shellfish',
      dietaryRules: 'dairy free',
      pantryStaples: 'rice, olive oil',
    },
  )
  assert.match(policy, /hard constraints/)
  assert.match(policy, /peanuts, shellfish/)
  assert.match(policy, /dairy free/)
  assert.match(policy, /rice, olive oil/)
  assert.match(policy, /flavor, texture, structure, and ratio/)
})

test('cooking grocery handoff blocks household allergens before execution', () => {
  assert.deepEqual(
    validateCookingGroceryItems(
      [{ name: 'peanut butter' }, { name: 'strawberries' }],
      { allergies: 'peanut, shellfish' },
    ),
    { allowed: false, blockedItems: ['peanut butter'] },
  )
  assert.deepEqual(
    validateCookingGroceryItems([{ name: 'sunflower butter' }], { allergies: 'peanut' }),
    { allowed: true, blockedItems: [] },
  )
})

test('saved recipe grounding includes authoritative ingredients and ordered steps', () => {
  const text = formatAuthoritativeRecipes([{
    id: 'recipe-1',
    name: 'Tomato Soup',
    servings: '4',
    recipe_ingredients: [
      { name: 'salt', raw_text: '1 tsp salt', sort_order: 2 },
      { name: 'tomatoes', raw_text: '4 tomatoes', sort_order: 1 },
    ],
    recipe_steps: [
      { step_number: 2, instruction: 'Blend until smooth.' },
      { step_number: 1, instruction: 'Simmer the tomatoes.' },
    ],
  }])
  assert.match(text, /recipe_id=recipe-1/)
  assert.ok(text.indexOf('4 tomatoes') < text.indexOf('1 tsp salt'))
  assert.ok(text.indexOf('Simmer the tomatoes') < text.indexOf('Blend until smooth'))
})

test('cooking authority outranks overlapping grocery parsing only in cooking context', () => {
  const source = fs.readFileSync(
    new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
    'utf8',
  )
  assert.ok(
    source.indexOf(': authoritativeCookingContext') <
      source.indexOf(': authoritativeGroceryContext'),
  )
  assert.match(source, /const recipeToolNames = cookingToolNames\(cookingFrame\)/)
  assert.match(source, /recipe_ingredients\(name, raw_text, quantity, unit, optional, sort_order\)/)
  assert.match(source, /: cookingSurfaceContext\s+\? \{ profile: 'recipe'/)
  assert.doesNotMatch(
    source,
    /\['grocery', 'recipe', 'full'\]\.includes\(intentRouting\.profile\)/,
  )
  assert.match(source, /intentRouting\.profile === 'recipe' && referencesSavedRecipe/)
  assert.match(source, /const includeFoodProfileContext = needsFoodProfileData/)
  assert.match(source, /const includeRecipeContext = needsRecipeData/)
  assert.match(source, /!authoritativeCookingContext \|\| cookingMutationIntent/)
  assert.match(source, /intentRouting\.profile === 'recipe'\s+\? RECIPE_PRIMARY_HARD_TIMEOUT_MS/)
  assert.match(source, /'create_recipe', 'add_grocery_items'\]\.includes\(tool\.name\)/)
  assert.match(source, /generation_config: \{\s+temperature: 0\.4,\s+max_output_tokens: 2048,/)
  assert.match(source, /finishReason === 'MAX_TOKENS'/)

  const executeSource = fs.readFileSync(
    new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
    'utf8',
  )
  assert.match(executeSource, /const recipeInsert = \{\s+name: recipeName,\s+source_type: 'manual',/)
})

test('combined grocery list requests remain read-only cooking follow-ups', () => {
  const frame = parseCookingLanguage('Make me one combined grocery list.', { assistantMode: 'chef' })
  assert.equal(
    frame?.intent,
    'cooking.missing_ingredients',
  )
  assert.deepEqual(frame?.slots, { source: 'conversation_plan' })
  assert.match(cookingFrameGuidance(frame), /read-only/)
  assert.match(cookingFrameGuidance(frame), /Do not ask the user to repeat ingredients/)
  assert.match(cookingFrameGuidance(frame), /Do not copy the existing Casa grocery list/)
  assert.equal(parseCookingLanguage('Make me one combined grocery list.'), null)
})

test('numbered dinner plans capture their requested ingredients', () => {
  const frame = parseCookingLanguage(
    'Plan three dinners using salmon, black beans, and leftover rice. Keep them kid friendly.',
    { assistantMode: 'chef' },
  )
  assert.equal(frame?.intent, 'cooking.meal_plan')
  assert.deepEqual(frame?.slots, { ingredients: 'salmon black beans and leftover rice' })
})

test('recipe scaling captures an explicit serving target', () => {
  assert.deepEqual(
    parseCookingLanguage('Make this recipe for eight people', { assistantMode: 'chef' })?.slots,
    { targetServings: 'eight' },
  )
})

test('common STT and spelling forms normalize before semantic parsing', () => {
  assert.equal(parseCookingLanguage('whats a good receipe for dinner')?.intent, 'cooking.recipe')
  assert.equal(parseCookingLanguage('what can i make with these ingredience')?.intent, 'cooking.from_ingredients')
  assert.equal(parseCookingLanguage('what can i do with left overs')?.intent, 'cooking.leftovers')
})

test('non-cooking language remains outside the cooking contract', () => {
  for (const text of [
    "What's going on Thursday?",
    'Add milk to the grocery list',
    'Will it rain tomorrow?',
    'Explain photosynthesis',
  ]) {
    assert.equal(parseCookingLanguage(text), null, text)
  }
  assert.equal(isCookingLikeLanguage('My sauce is too salty'), true)
  assert.equal(isCookingLikeLanguage('Move soccer practice'), false)
})
