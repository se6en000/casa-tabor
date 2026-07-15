import { normalizeAssistantLanguage } from './assistant-language-normalization.mjs'

const SEARCH_STOP_WORDS = new Set(['a', 'an', 'any', 'for', 'my', 'recipe', 'recipes', 'the'])

function searchToken(value) {
  const normalized = normalizeAssistantLanguage(value).replace(/[^a-z0-9\s]/g, ' ')
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !SEARCH_STOP_WORDS.has(token))
    .map((token) => token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token)
}

function recipeSearchText(recipe) {
  const ingredients = Array.isArray(recipe?.recipe_ingredients)
    ? recipe.recipe_ingredients.flatMap((item) => [item?.name, item?.raw_text])
    : []
  return searchToken([recipe?.name, ...ingredients].filter(Boolean).join(' '))
}

export function findSavedRecipes(recipes, query, limit = 5) {
  if (!Array.isArray(recipes)) return []
  const queryTokens = [...new Set(searchToken(query))]
  if (queryTokens.length === 0) return []

  return recipes
    .map((recipe, index) => {
      const haystack = new Set(recipeSearchText(recipe))
      const matched = queryTokens.filter((token) => haystack.has(token)).length
      return { recipe, index, matched }
    })
    .filter((row) => row.matched === queryTokens.length)
    .sort((a, b) => b.matched - a.matched || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((row) => row.recipe)
}

export function formatSavedRecipeMatches(matches, query) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return `I couldn't find a saved recipe matching "${String(query).trim()}" in your Recipe Library.`
  }
  if (matches.length === 1) {
    return `Yes — I found **${matches[0].name}** in your Recipe Library.`
  }
  return `Yes — I found ${matches.length} matching recipes in your Recipe Library:\n${matches.map((recipe) => `- **${recipe.name}**`).join('\n')}`
}
