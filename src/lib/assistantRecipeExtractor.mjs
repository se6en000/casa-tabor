/**
 * Utility to reliably extract an appropriate recipe/meal title from an AI assistant message.
 */

const NON_TITLE_WORDS = new Set([
  'ingredients', 'instructions', 'directions', 'steps', 'notes',
  'prep time', 'cook time', 'total time', 'servings', 'chef suggestion',
  'tonight\'s kitchen action', 'options', 'recipe draft', 'overview',
  'summary', 'details', 'pantry', 'preferences', 'nutrition', 'serves'
])

function cleanCandidate(text) {
  if (!text) return ''
  return text
    .replace(/^[*#`_\s>]+/, '')
    .replace(/[*#`_\s]+$/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+recipe\.?$/i, '') // Clean trailing " recipe" or " recipe."
    .replace(/\s+dish\.?$/i, '')   // Clean trailing " dish"
    .trim()
}

function isValidTitleCandidate(text) {
  if (!text) return false
  const cleaned = cleanCandidate(text)
  if (cleaned.length < 3 || cleaned.length > 90) return false

  const lower = cleaned.toLowerCase()

  // Skip if it contains timing / serving / quantity phrases
  if (/\b(?:cook|prep|total)\s*time\b|\b\d+\s*(?:mins?|minutes?|hours?|servings?)\b|\btime of \d+/i.test(lower)) {
    return false
  }

  // Skip section headers or metadata keywords
  if (NON_TITLE_WORDS.has(lower)) return false

  // Skip conversational intros / questions / sentence fragments
  if (/[?:!]$/.test(cleaned) && !/pan-seared|baked|grilled|fried|roasted|soup|stew|salad|tacos|pasta|bowls?|chicken|salmon|beef|steak/i.test(cleaned)) {
    return false
  }

  if (
    /^based on/i.test(cleaned) ||
    /^you have/i.test(cleaned) ||
    /^would you like/i.test(cleaned) ||
    /^here is/i.test(cleaned) ||
    /^here are/i.test(cleaned) ||
    /^what about/i.test(cleaned) ||
    /^it uses/i.test(cleaned) ||
    /^this recipe/i.test(cleaned) ||
    /^chef suggestion/i.test(cleaned)
  ) {
    return false
  }

  return true
}

export function extractMealTitle(messageContent) {
  if (!messageContent || typeof messageContent !== 'string') {
    return "Simple Pasta Dish"
  }

  // Tier 1: Explicit "Title: <Title>" or "Recipe: <Title>" label
  const explicitMatch = messageContent.match(/(?:^|\n)\s*(?:Title|Recipe|Meal Title|Recipe Title)\s*:\s*([^\n]+)/i)
  if (explicitMatch && explicitMatch[1]) {
    const candidate = cleanCandidate(explicitMatch[1])
    if (isValidTitleCandidate(candidate)) {
      return candidate
    }
  }

  // Tier 2: Bolding anywhere in text (e.g., "**Quick Salmon Power Bowls**" or "**Garlic Shrimp**")
  const boldMatches = Array.from(messageContent.matchAll(/\*\*([^*]+)\*\*/g))
  for (const match of boldMatches) {
    const candidate = cleanCandidate(match[1])
    if (isValidTitleCandidate(candidate)) {
      return candidate
    }
  }

  // Tier 3: Markdown Headings (# Header, ## Header, etc.)
  const headerMatches = Array.from(messageContent.matchAll(/(?:^|\n)\s*#{1,6}\s*([^\n#]+)/g))
  for (const match of headerMatches) {
    const candidate = cleanCandidate(match[1])
    if (isValidTitleCandidate(candidate)) {
      return candidate
    }
  }

  // Tier 4: Recommendation phrasing ("recommend/suggest/make/cook the <Dish> [recipe]")
  const recMatch = messageContent.match(/(?:recommend|suggest|make|cook|prepare)(?:\s+the|\s+a|\s+an)?\s+([A-Z][a-zA-Z0-9\s-]{3,60}?)(?:\s+recipe|\s+for|\.|\!|\,|\n|$)/i)
  if (recMatch && recMatch[1]) {
    const candidate = cleanCandidate(recMatch[1])
    if (isValidTitleCandidate(candidate)) {
      return candidate
    }
  }

  // Tier 5: Scan lines for a valid standalone title candidate
  const lines = messageContent
    .split('\n')
    .map(cleanCandidate)
    .filter(Boolean)

  for (const line of lines) {
    if (isValidTitleCandidate(line)) {
      return line
    }
  }

  return "Simple Pasta Dish"
}
