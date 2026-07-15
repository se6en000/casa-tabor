import { normalizeAssistantLanguage } from './assistant-language-normalization.mjs'

const FOODS = ['chicken', 'pasta', 'salmon', 'rice', 'broccoli']
const RECIPE_NAMES = ['chicken tacos', 'pasta primavera', 'banana bread', 'tomato soup']

export const COOKING_INTENTS = Object.freeze([
  'cooking.suggest',
  'cooking.from_ingredients',
  'cooking.recipe',
  'cooking.substitute',
  'cooking.scale',
  'cooking.convert',
  'cooking.temperature',
  'cooking.doneness',
  'cooking.technique',
  'cooking.troubleshoot',
  'cooking.next_step',
  'cooking.repeat_step',
  'cooking.timing',
  'cooking.storage',
  'cooking.reheat',
  'cooking.safety',
  'cooking.meal_plan',
  'cooking.dietary',
  'cooking.leftovers',
  'cooking.missing_ingredients',
  'cooking.add_to_grocery',
  'cooking.nutrition',
  'recipe.save',
])

const samples = {
  'cooking.suggest': [
    'what should i make for dinner',
    'give me an easy dinner idea',
    'i need something quick for lunch',
    'what sounds good for breakfast',
  ],
  'cooking.from_ingredients': FOODS.flatMap((food) => [
    `what can i make with ${food}`,
    `give me something using ${food}`,
    `i have ${food} what can i cook`,
  ]),
  'cooking.recipe': RECIPE_NAMES.flatMap((recipe) => [
    `how do i make ${recipe}`,
    `give me a recipe for ${recipe}`,
    `walk me through ${recipe}`,
  ]),
  'cooking.substitute': [
    'what can i use instead of buttermilk',
    'i am out of eggs what can i swap in',
    'can i replace butter with olive oil',
    'what is a substitute for sour cream',
  ],
  'cooking.scale': [
    'double this recipe',
    'make this for eight people',
    'cut the recipe in half',
    'scale this from four servings to six',
  ],
  'cooking.convert': [
    'how many tablespoons are in a cup',
    'convert 350 fahrenheit to celsius',
    'what is 200 grams in ounces',
    'how much is three teaspoons in tablespoons',
  ],
  'cooking.temperature': [
    'what temperature should i bake chicken at',
    'what should the oven be set to for cookies',
    'how hot should the grill be',
  ],
  'cooking.doneness': [
    'how do i know when the salmon is done',
    'what temperature is chicken done',
    'is the cake done if the toothpick is clean',
  ],
  'cooking.technique': [
    'how do i dice an onion',
    'what does fold in mean',
    'how do i sear a steak',
    'show me how to make a roux',
  ],
  'cooking.troubleshoot': [
    'why is my sauce too thin',
    'my dough is too sticky how do i fix it',
    'the soup is too salty',
    'why did my cake sink',
  ],
  'cooking.next_step': ['what do i do next', 'what is the next step', 'okay then what', 'where was i'],
  'cooking.repeat_step': ['say that step again', 'repeat the last instruction', 'what was that again'],
  'cooking.timing': [
    'how long should i cook the chicken',
    'when should i start dinner',
    'how long does this need in the oven',
  ],
  'cooking.storage': [
    'how long will this keep in the fridge',
    'can i freeze this',
    'how should i store leftover rice',
  ],
  'cooking.reheat': [
    'how should i reheat this',
    'what is the best way to warm up pizza',
    'how long do i microwave the leftovers',
  ],
  'cooking.safety': [
    'is this chicken still safe to eat',
    'can i leave this out overnight',
    'is it safe to refreeze this',
  ],
  'cooking.meal_plan': [
    'plan dinners for this week',
    'give me five weeknight meals',
    'make a meal plan for the family',
  ],
  'cooking.dietary': [
    'make this dairy free',
    'give me a gluten free version',
    'how can i make this vegetarian',
  ],
  'cooking.leftovers': [
    'what can i do with leftover chicken',
    'help me use up the rice',
    'turn these leftovers into dinner',
  ],
  'cooking.missing_ingredients': [
    'what ingredients am i missing',
    'what do i need to buy for this recipe',
    'compare this recipe to my grocery list',
  ],
  'cooking.add_to_grocery': [
    'add the missing ingredients to my grocery list',
    'put everything i need for this recipe on the shopping list',
    'add those ingredients to groceries',
  ],
  'cooking.nutrition': [
    'how much protein is in this',
    'roughly how many calories per serving',
    'is this meal high in sodium',
  ],
  'recipe.save': [
    'save this recipe',
    'add this to my recipe library',
    'keep this recipe for later',
  ],
}

export const COOKING_UTTERANCE_CORPUS = Object.freeze(
  Object.entries(samples).flatMap(([intent, texts]) => texts.map((text) => ({ text, intent }))),
)

function normalize(value) {
  return normalizeAssistantLanguage(value)
}

function frame(intent, confidence, slots = {}) {
  return {
    domain: 'cooking',
    intent,
    confidence,
    source: 'cooking_language_contract',
    slots,
  }
}

function extractAfter(input, pattern) {
  return input.match(pattern)?.[1]?.trim() ?? null
}

export function parseCookingLanguage(text, options = {}) {
  const input = normalize(text)
  if (!input) return null
  const cookingContext = options.assistantMode === 'chef' || options.activeEntityType === 'recipe'

  if (/\b(?:save|keep|store|add)\b.*\b(?:this|that|the)?\s*recipe\b|\badd this to my recipe library\b/.test(input)) {
    return frame('recipe.save', 0.98)
  }
  if (/\b(?:add|put)\b.*\b(?:missing ingredients?|everything i need|those ingredients?)\b.*\b(?:grocery|groceries|shopping list)\b/.test(input)) {
    return frame('cooking.add_to_grocery', 0.99, { source: 'conversation_recipe' })
  }
  if (cookingContext && /^(?:make|give|create)(?: me)? (?:one )?(?:combined )?grocery list$/.test(input)) {
    return frame('cooking.missing_ingredients', 0.97, { source: 'conversation_plan' })
  }
  if (/\b(?:what ingredients? am i missing|what do i need to buy for (?:this|the) recipe|compare (?:this|the) recipe to my grocery list)\b/.test(input)) {
    return frame('cooking.missing_ingredients', 0.96)
  }
  if (/\b(?:calories?|protein|carbs?|carbohydrates?|fat|sodium|fiber|nutrition)\b/.test(input)) {
    return frame('cooking.nutrition', 0.93)
  }
  if (/\b(?:meal plan|plan (?:(?:one|two|three|four|five|six|\d+)\s+)?(?:our|my|the family)?\s*(?:meals|dinners)|weeknight meals)\b/.test(input)) {
    const ingredients = extractAfter(input, /\busing\s+(.+?)(?:\.\s*keep|\s+keep|$)/)
    return frame('cooking.meal_plan', 0.96, ingredients ? { ingredients } : {})
  }
  if (/\b(?:dairy free|gluten free|vegetarian|vegan|nut free|low carb|keto)\b/.test(input)) {
    return frame('cooking.dietary', 0.94)
  }
  if (/\b(?:substitute|instead of|swap in|replace .+ with)\b/.test(input)) {
    return frame('cooking.substitute', 0.97, {
      ingredient: extractAfter(input, /(?:instead of|substitute for|swap in for)\s+(.+)$/),
    })
  }
  if (/\b(?:double|triple|cut .+ in half|scale|servings?|people)\b/.test(input) && /\b(?:recipe|this|make)\b/.test(input)) {
    const targetServings = input.match(/\b(?:for|to|serves?)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*(?:people|servings?)?\b/)?.[1] ?? null
    return frame('cooking.scale', 0.96, targetServings ? { targetServings } : {})
  }
  if (/\b(?:convert|how many|what is|how much)\b.*\b(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|grams?|kilograms?|pounds?|lbs?|fahrenheit|celsius)\b/.test(input)) {
    return frame('cooking.convert', 0.96)
  }
  if (/\b(?:safe to eat|food safe|leave .+ out|refreeze|gone bad|still good)\b/.test(input)) {
    return frame('cooking.safety', 0.97)
  }
  if (/\b(?:store|keep in the fridge|keep in the freezer|freeze this|freeze it)\b/.test(input)) {
    return frame('cooking.storage', 0.95)
  }
  if (/\b(?:reheat|warm up|microwave the leftovers)\b/.test(input)) return frame('cooking.reheat', 0.96)
  if (/\b(?:leftovers?|use up)\b/.test(input)) return frame('cooking.leftovers', 0.94)
  if (/\b(?:too salty|too thin|too thick|too sticky|burnt|burned|cake sink|fix it|went wrong)\b/.test(input) ||
      /\bwhy (?:is|did|does)\b.*\b(?:sauce|dough|soup|cake|bread|food)\b/.test(input)) {
    return frame('cooking.troubleshoot', 0.95)
  }
  if (/\b(?:how do i know|what temperature is)\b.*\b(?:done|ready|cooked)\b|\bis .+ done\b/.test(input)) {
    return frame('cooking.doneness', 0.96)
  }
  if (/\b(?:what temperature|what should the oven|how hot should)\b/.test(input)) {
    return frame('cooking.temperature', 0.95)
  }
  if (/\b(?:how do i|how to|what does)\b.*\b(?:dice|chop|mince|fold|sear|saute|sauté|roux|blanch|braise|deglaze|knead)\b/.test(input)) {
    return frame('cooking.technique', 0.95)
  }
  if (/\b(?:explain|show me|tell me|walk me through)?\s*how to\s+(?:cook|prepare|pan sear|grill|roast|bake)\b/.test(input)) {
    return frame('cooking.technique', 0.95)
  }
  if (/\b(?:say|tell me|read)\b.*\b(?:step|instruction)\b.*\bagain\b|\brepeat (?:that|the last)\b/.test(input) ||
      (cookingContext && /\bwhat was that again\b/.test(input))) {
    return frame('cooking.repeat_step', 0.96)
  }
  if (cookingContext && /\b(?:what do i do next|what is the next step|okay then what|where was i)\b/.test(input)) {
    return frame('cooking.next_step', 0.95)
  }
  if (/\b(?:how long|when should i start)\b.*\b(?:cook|bake|roast|grill|dinner|oven|it|this|chicken|meat|fish)\b/.test(input)) {
    return frame('cooking.timing', 0.94)
  }
  const haveIngredients = input.match(/^i have\s+(.+?)\s+what can i cook$/)?.[1]?.trim() ?? null
  const ingredients = haveIngredients ??
    extractAfter(input, /(?:what can i (?:make|cook)|give me something)\s+(?:using|with)\s+(.+)$/)
  if (ingredients) {
    return frame('cooking.from_ingredients', 0.95, { ingredients })
  }
  const recipe = extractAfter(input, /(?:how do i make|recipe for|walk me through)\s+(.+)$/)
  if (recipe) return frame('cooking.recipe', 0.95, { recipe })
  if (/\b(?:what should i make|dinner idea|lunch idea|breakfast idea|something quick for (?:dinner|lunch|breakfast)|what sounds good)\b/.test(input)) {
    return frame('cooking.suggest', 0.93)
  }
  return null
}

export function cookingFrameGuidance(frameValue) {
  if (frameValue?.intent === 'cooking.add_to_grocery') {
    return 'Use add_grocery_items exactly once with only the explicit missing or selected ingredients from the immediately preceding recipe. Preserve useful quantities and units. Do not add pantry staples unless the user selected them or the household food profile does not identify them as on hand.'
  }
  if (
    frameValue?.intent === 'cooking.missing_ingredients' &&
    frameValue.slots?.source === 'conversation_plan'
  ) {
    return 'Derive a read-only grocery list only from the immediately preceding meal plan in the conversation. Consolidate the ingredients required for those meals into a Markdown list. Do not copy the existing Casa grocery list. Do not ask the user to repeat ingredients, and do not save anything.'
  }
  if (frameValue?.intent === 'cooking.missing_ingredients') {
    return 'Derive a read-only ingredient or grocery list from the recipe or meal plan in the conversation. Return a consolidated Markdown list. Do not ask the user to repeat ingredients, and do not save anything unless they explicitly ask to add or save the listed items.'
  }
  return null
}

export function isCookingLikeLanguage(text) {
  const input = normalize(text)
  return /\b(?:cook|recipe|meal|dinner|lunch|breakfast|ingredient|oven|bake|roast|grill|leftover|substitute|servings?|reheat|freeze|sauce|dough)\b/.test(input)
}
