const EVENT_TERMS = /\b(calendar|event|events|appointment|appointments|appt|apt|reminder|reminders|schedule|scheduled|therapy|practice|birthday|party|trip|vacation|double[- ]?book|conflict|busy|free)\b/i
const GENERIC_ACTION = /\b(add|create|save|store|check|clear|delete|remove|update|change|move|send|book|schedule)\b/i
const AMBIGUOUS_MUTATION = /\b(delete|remove|update|change|move)\b/i
const ADDITIVE_ACTION = /\b(add|create|book|schedule)\b/i
const EXPLICIT_CALENDAR_OPERATION = /\b(show|list|search|find|look up|check|add|create|book|schedule|move|reschedule|change|update|edit|delete|remove|cancel|complete|mark done)\b/i
const EXPLICIT_CALENDAR_ANCHOR = /\b(calendar|event|events|appointment|appointments|appt|apt|reminder|reminders|schedule)\b/i

export function shouldUseTalkPlanCalendarCommandLane(text, options = {}) {
  const input = String(text ?? '').trim()
  if (!EXPLICIT_CALENDAR_OPERATION.test(input)) return false
  return options.hasActiveEvent === true || EXPLICIT_CALENDAR_ANCHOR.test(input)
}

export function classifyAssistantIntent(text, options = {}) {
  const input = String(text ?? '').trim()
  const focusedEvent = options.focusedEvent === true
  const activeEvent = options.activeEntityType === 'event'
  const activeGroceryItem = options.activeEntityType === 'grocery_item'
  const pendingEventAction = options.pendingEventAction === true
  const assistantMode = options.assistantMode === 'chef' ? 'chef' : 'general'
  if (options.experienceMode === 'talk_plan' && assistantMode === 'general' && !focusedEvent) {
    return { profile: 'talk_plan', forceEventSearch: false }
  }
  const eventFollowUp = pendingEventAction || (activeEvent && (
    /\b(it|that|this|one|party|location|address|venue|calendar|time|when|where|who|attend|bring|prep|prepare|details?|drive|travel|traffic|route|eta|leave|get there|how long)\b/i.test(input) ||
    /^(?:yes|yeah|yep|correct|right|do it|update it|change it)\b/i.test(input)
  ))
  const hasEventIntent = focusedEvent || eventFollowUp || EVENT_TERMS.test(input)
  const hasWeatherIntent = /\b(weather|forecast|temperature|rain|storm|umbrella|uv|heat index|beach day|kayak)\b/i.test(input)
  const hasTravelIntent = /\b(traffic|commute|drive time|travel time|leave by|when should (?:i|we) leave|eta|route)\b/i.test(input)
  const groceryFollowUp = activeGroceryItem && /^(?:make|change|update|set)\s+(?:that|it)\b/i.test(input)
  const hasGroceryIntent = groceryFollowUp || /\b(grocer(?:y|ies)|shopping list|buy|bought|picked up|pantry|restock|food shop|check off)\b/i.test(input)
  const hasRecipeIntent = assistantMode === 'chef' ||
    /\b(recipe|cook|meal|dinner|lunch|breakfast|ingredient|servings?)\b/i.test(input)
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

  if (hasRecipeIntent && AMBIGUOUS_MUTATION.test(input)) {
    return { profile: 'full', forceEventSearch: false }
  }
  if (hasEventIntent) {
    const hasAuthoritativeEvent = focusedEvent || eventFollowUp
    if (matchedDomains > 1 && !hasAuthoritativeEvent && !ADDITIVE_ACTION.test(input)) {
      return { profile: 'full', forceEventSearch: false }
    }
    return { profile: 'event', forceEventSearch: !hasAuthoritativeEvent }
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
