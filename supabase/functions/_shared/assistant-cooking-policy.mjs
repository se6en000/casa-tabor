function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function list(value) {
  return clean(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function cookingPolicyGuidance(frame, foodProfile = {}) {
  if (!frame) return null
  const allergies = list(foodProfile.allergies)
  const dietaryRules = list(foodProfile.dietaryRules)
  const dislikedFoods = list(foodProfile.dislikedFoods)
  const pantryStaples = list(foodProfile.pantryStaples)
  const lines = [
    'COOKING POLICY (authoritative):',
    '- Never recommend an ingredient listed in household allergies. Treat allergy exclusions as hard constraints, including substitutions and garnishes.',
    '- Do not claim food is safe from appearance or smell alone. For doneness, storage, reheating, and uncertain spoilage, give conservative time/temperature guidance and recommend discarding food when safety cannot be established.',
    '- Clearly distinguish established food-safety guidance from flexible culinary preference.',
    '- Never claim a recipe, grocery write, or saved change occurred unless Casa returns a verified tool result.',
  ]
  if (allergies.length) lines.push(`- Allergy exclusions: ${allergies.join(', ')}.`)
  if (dietaryRules.length) lines.push(`- Dietary rules: ${dietaryRules.join(', ')}.`)
  if (dislikedFoods.length) lines.push(`- Avoid when practical: ${dislikedFoods.join(', ')}.`)
  if (pantryStaples.length) lines.push(`- Pantry staples reported on hand: ${pantryStaples.join(', ')}.`)
  if (frame.intent === 'cooking.nutrition') {
    lines.push('- Nutrition values are estimates unless grounded in exact package or recipe quantities; label estimates explicitly.')
  }
  if (frame.intent === 'cooking.substitute') {
    lines.push('- Explain how the substitution changes flavor, texture, structure, and ratio when relevant.')
  }
  if (frame.intent === 'cooking.scale') {
    lines.push('- Scale ingredient amounts, but do not blindly multiply pan size, cooking temperature, or cooking time; explain the checks that determine doneness.')
  }
  return lines.join('\n')
}

export function cookingToolNames(frame) {
  if (frame?.intent === 'recipe.save') return ['create_recipe']
  if (frame?.intent === 'cooking.add_to_grocery') return ['add_grocery_items']
  return []
}

export function validateCookingGroceryItems(items, foodProfile = {}) {
  const allergies = list(foodProfile.allergies).map((item) => item.toLowerCase())
  const blockedItems = (Array.isArray(items) ? items : []).filter((item) => {
    const name = clean(item?.name).toLowerCase()
    return name && allergies.some((allergy) => {
      const terms = allergy.split(/\s+/).filter((term) => term.length > 2)
      return terms.length > 0 && terms.every((term) => name.includes(term))
    })
  })
  return {
    allowed: blockedItems.length === 0,
    blockedItems: blockedItems.map((item) => clean(item.name)),
  }
}

export function formatAuthoritativeRecipes(recipes) {
  if (!Array.isArray(recipes) || recipes.length === 0) return 'No recipes saved yet.'
  return recipes.slice(0, 20).map((recipe, index) => {
    const ingredients = Array.isArray(recipe.recipe_ingredients)
      ? recipe.recipe_ingredients
        .slice()
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((item) => clean(item.raw_text) || [item.quantity, item.unit, item.name].filter(Boolean).join(' '))
        .filter(Boolean)
      : []
    const steps = Array.isArray(recipe.recipe_steps)
      ? recipe.recipe_steps
        .slice()
        .sort((a, b) => Number(a.step_number ?? 0) - Number(b.step_number ?? 0))
        .map((step) => clean(step.instruction))
        .filter(Boolean)
      : []
    return [
      `${index + 1}. ${recipe.name} [recipe_id=${recipe.id}]${recipe.servings ? `; servings=${recipe.servings}` : ''}${recipe.cook_time ? `; time=${recipe.cook_time}` : ''}`,
      ingredients.length ? `Ingredients: ${ingredients.join(' | ')}` : 'Ingredients: not saved',
      steps.length ? `Steps: ${steps.map((step, stepIndex) => `${stepIndex + 1}) ${step}`).join(' ')}` : 'Steps: not saved',
    ].join('\n')
  }).join('\n\n')
}
