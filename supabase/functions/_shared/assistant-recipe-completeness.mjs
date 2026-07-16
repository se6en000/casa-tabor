const SECTION_HEADING = /^#{1,6}\s+(.+)$/m
const SERVINGS = /\b(?:serves?|servings?|yield)\s*:?\s*(?:about\s+)?\d+\b/i
const INGREDIENTS_HEADING = /^#{1,6}\s+ingredients\b/im
const STEPS_HEADING = /^#{1,6}\s+(?:instructions|directions|steps|method)\b/im
const INGREDIENT_ITEM = /^\s*[-*]\s+\S+/m
const STEP_ITEM = /^\s*\d+[.)]\s+\S+/m

export function missingCompleteRecipeSections(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ['title', 'servings', 'ingredients', 'steps']

  return [
    SECTION_HEADING.test(text) ? null : 'title',
    SERVINGS.test(text) ? null : 'servings',
    INGREDIENTS_HEADING.test(text) && INGREDIENT_ITEM.test(text) ? null : 'ingredients',
    STEPS_HEADING.test(text) && STEP_ITEM.test(text) ? null : 'steps',
  ].filter(Boolean)
}

export function isCompleteRecipeResponse(value) {
  return missingCompleteRecipeSections(value).length === 0
}
