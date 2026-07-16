import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  COOKING_INTENTS,
  COOKING_UTTERANCE_CORPUS,
  cookingFrameGuidance,
  isCookingRetryLanguage,
  isCookingLikeLanguage,
  parseCookingLanguage,
} from '../supabase/functions/_shared/assistant-cooking-language.mjs'
import {
  isCompleteRecipeResponse,
  missingCompleteRecipeSections,
} from '../supabase/functions/_shared/assistant-recipe-completeness.mjs'
import {
  cookingPolicyGuidance,
  cookingToolNames,
  formatAuthoritativeRecipes,
  validateCookingGroceryItems,
} from '../supabase/functions/_shared/assistant-cooking-policy.mjs'

const assistantFunction = fs.readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('cooking language contract publishes stable concepts and generated coverage', () => {
  assert.equal(COOKING_INTENTS.length, 24)
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

test('chef mode treats natural recipe creation wording as read-only recipe generation', () => {
  for (const text of [
    'Can you create a short recipe that includes tilapia and mushrooms for me?',
    'Can you create a recipe with tilapia in a mushroom sauce?',
    'I wanna create a recipe where I can use fish and mushrooms do you have any suggestions',
    'Help me construct this dinner',
    "I have these ingredients for a recipe but I don't have the steps, can you create them?",
  ]) {
    assert.equal(parseCookingLanguage(text, { assistantMode: 'chef' })?.intent, 'cooking.recipe', text)
  }
  assert.deepEqual(
    parseCookingLanguage(
      'Can you create a short recipe that includes tilapia and mushrooms for me?',
      { assistantMode: 'chef' },
    )?.slots,
    { ingredients: 'tilapia and mushrooms' },
  )
  assert.equal(parseCookingLanguage('Save this recipe', { assistantMode: 'chef' })?.intent, 'recipe.save')
})

test('cooking retry language is narrow and does not reinterpret unrelated requests', () => {
  assert.equal(isCookingRetryLanguage('Can you try again?'), true)
  assert.equal(isCookingRetryLanguage('redo the recipe'), true)
  assert.equal(isCookingRetryLanguage('try salmon with mushrooms'), false)
  assert.equal(isCookingRetryLanguage('create a calendar event again'), false)
})

test('recipe generation has one bounded text-only provider recovery lane', () => {
  assert.match(assistantFunction, /finishReason === 'UNEXPECTED_TOOL_CALL' && requiresCompleteRecipe/)
  assert.match(assistantFunction, /runRecipeTextRecovery\('unexpected_tool_call'\)/)
  assert.match(assistantFunction, /runRecipeTextRecovery\('incomplete_recipe'\)/)
  assert.match(assistantFunction, /recipeTextRecoveryUsed/)
  assert.match(assistantFunction, /Do not call tools, save anything, emit JSON/)
  assert.match(assistantFunction, /server_ai_assistant_recipe_recovered/)
  assert.match(assistantFunction, /const inheritedCookingFrame = !latestCookingFrame/)
  assert.match(assistantFunction, /Original request to retry:/)
  assert.match(assistantFunction, /source: 'cooking_language_contract',\s*semantic_intent: cookingFrame\.intent/)
})

test('cooking parser extracts useful open-class slots', () => {
  assert.deepEqual(parseCookingLanguage('How do I make chicken tacos?')?.slots, { recipe: 'chicken tacos' })
  assert.deepEqual(parseCookingLanguage('What can I make with salmon and rice?')?.slots, { ingredients: 'salmon and rice' })
  assert.equal(parseCookingLanguage('What can I use instead of buttermilk?')?.slots.ingredient, 'buttermilk')
})

test('natural saved-recipe questions are authoritative library searches', () => {
  for (const [text, query] of [
    ['do i have a salmon bowl recipe?', 'salmon bowl'],
    ['is there a recipe for salmon bowls', 'salmon bowls'],
    ['search my recipe library for pasta', 'pasta'],
  ]) {
    const frame = parseCookingLanguage(text)
    assert.equal(frame?.intent, 'recipe.find', text)
    assert.equal(frame?.slots.query, query, text)
  }
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

test('complete recipe responses require all user-visible sections', () => {
  const complete = `# One-Pan Salmon Bake

Serves: 4

## Ingredients
- 4 salmon fillets
- 1 pound potatoes

## Instructions
1. Roast the potatoes.
2. Add the salmon and finish baking.`
  assert.equal(isCompleteRecipeResponse(complete), true)
  assert.deepEqual(missingCompleteRecipeSections(complete), [])
  assert.deepEqual(
    missingCompleteRecipeSections('# Salmon\n\n## Ingredients\n- Salmon'),
    ['servings', 'steps'],
  )
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
  assert.match(source, /: cookingSurfaceContext\s+\? \{ route: \{ profile: 'recipe'/)
  assert.doesNotMatch(
    source,
    /\['grocery', 'recipe', 'full'\]\.includes\(intentRouting\.profile\)/,
  )
  assert.match(source, /intentRouting\.profile === 'recipe' && referencesSavedRecipe/)
  assert.match(source, /const includeFoodProfileContext = needsFoodProfileData/)
  assert.match(source, /const includeRecipeContext = needsRecipeData/)
  assert.match(source, /cookingFrame\?\.intent === 'recipe\.find'/)
  assert.match(source, /server_ai_assistant_recipe_find/)
  assert.match(source, /!authoritativeCookingContext \|\| cookingMutationIntent/)
  assert.match(source, /hasGroundedSemanticIntent: cookingMutationIntent/)
  assert.match(source, /intentRouting\.profile === 'recipe'\s+\? RECIPE_PRIMARY_HARD_TIMEOUT_MS/)
  assert.match(source, /'create_recipe', 'add_grocery_items'\]\.includes\(tool\.name\)/)
  assert.match(source, /max_output_tokens: intentRouting\.profile === 'recipe' \? 4096 : 2048/)
  assert.match(source, /thinking_config: \{ thinking_budget: 0 \}/)
  assert.match(source, /finishReason === 'MAX_TOKENS'/)
  assert.match(source, /incomplete_stream_missing_finish_reason/)
  assert.match(source, /server_ai_assistant_recipe_incomplete/)
  assert.match(source, /RECIPE_REQUEST_HARD_TIMEOUT_MS = 15000/)

  const executeSource = fs.readFileSync(
    new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
    'utf8',
  )
  assert.match(executeSource, /const recipeInsert = \{\s+name: recipeName,\s+source_type: 'manual',/)
  assert.match(executeSource, /appendActionTrace\('server_ai_action_succeeded', 'create_recipe'/)

  const drawerSource = fs.readFileSync(
    new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url),
    'utf8',
  )
  assert.match(drawerSource, /invalidateQueries\(\{ queryKey: \['cook-page-recipes'\] \}\)/)
  assert.match(drawerSource, /invalidateQueries\(\{ queryKey: \['recipe-library'\] \}\)/)

  const cookPageSource = fs.readFileSync(
    new URL('../src/pages/CookPage.tsx', import.meta.url),
    'utf8',
  )
  assert.match(cookPageSource, /if \(query\) return haystack\.includes\(query\)/)
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
