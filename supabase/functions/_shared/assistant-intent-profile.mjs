const EVENT_TERMS = /\b(calendar|event|events|appointment|appointments|reminder|reminders|schedule|scheduled|therapy|practice|double[- ]?book|conflict|busy|free)\b/i
const EVENT_TIME_QUERY = /\b(what(?:'s| is| do we have| have we got)?|anything|who)\b.*\b(today|tomorrow|tonight|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next)\b/i
const EVENT_CREATE = /\b(create|add|book|set up)\b.*\b(event|appointment|reminder|calendar)\b|\bschedule\b.*\b(for|on|at|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
const EVENT_MUTATION = /\b(move|resched(?:ule)?|change|update|edit|delete|remove|cancel|shift|push)\b/i
const GENERIC_ACTION = /\b(add|create|save|store|check|clear|delete|remove|update|change|move|send|book|schedule)\b/i

export function classifyAssistantIntent(text, options = {}) {
  const input = String(text ?? '').trim()
  const focusedEvent = options.focusedEvent === true
  const assistantMode = options.assistantMode === 'chef' ? 'chef' : 'general'
  const hasEventIntent = focusedEvent || EVENT_TERMS.test(input) || EVENT_TIME_QUERY.test(input)
  const hasWeatherIntent = /\b(weather|forecast|temperature|rain|storm|umbrella|uv|heat index|beach day|kayak)\b/i.test(input)
  const hasTravelIntent = /\b(traffic|commute|drive time|travel time|leave by|when should (?:i|we) leave|eta|route)\b/i.test(input)
  const hasGroceryIntent = /\b(grocer(?:y|ies)|shopping list|buy|pantry|restock|food shop)\b/i.test(input)
  const hasRecipeIntent = assistantMode === 'chef' || /\b(recipe|cook|meal|dinner|lunch|breakfast|ingredient|servings?)\b/i.test(input)
  const hasPlaceIntent = /\b(address|phone number|where is|find (?:a|an|the)?\s*(?:restaurant|store|business|place)|nearby)\b/i.test(input)
  const hasWebIntent = /\b(latest|news|score|stock price|current price|recent review|look it up|search the web)\b/i.test(input)
  const matchedDomains = [
    hasEventIntent,
    hasWeatherIntent,
    hasTravelIntent,
    hasGroceryIntent,
    hasRecipeIntent,
    hasPlaceIntent,
    hasWebIntent,
  ].filter(Boolean).length

  if (hasEventIntent) {
    const createIntent = !focusedEvent && EVENT_CREATE.test(input) && !EVENT_MUTATION.test(input)
    if (matchedDomains > 1 && !focusedEvent && !createIntent) {
      return { profile: 'full', forceEventSearch: false }
    }
    return { profile: 'event', forceEventSearch: !focusedEvent && !createIntent }
  }
  if (matchedDomains > 1) return { profile: 'full', forceEventSearch: false }
  if (hasWeatherIntent) return { profile: 'weather', forceEventSearch: false }
  if (hasTravelIntent) return { profile: 'travel', forceEventSearch: false }
  if (hasGroceryIntent) return { profile: 'grocery', forceEventSearch: false }
  if (hasRecipeIntent) return { profile: 'recipe', forceEventSearch: false }
  if (hasPlaceIntent) return { profile: 'places', forceEventSearch: false }
  if (hasWebIntent) return { profile: 'web', forceEventSearch: false }
  if (GENERIC_ACTION.test(input)) return { profile: 'full', forceEventSearch: false }
  return { profile: 'general', forceEventSearch: false }
}
