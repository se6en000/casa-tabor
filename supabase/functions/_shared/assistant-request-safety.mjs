import { normalizeAssistantLanguage } from './assistant-language-normalization.mjs'

const GROCERY_MUTATION_TOOLS = new Set([
  'add_grocery_items',
  'check_grocery_item',
  'remove_grocery_item',
  'update_grocery_item_quantity',
  'clear_checked_grocery_items',
])

export function safeFullProfileToolNames(toolNames) {
  return toolNames.filter((toolName) => !GROCERY_MUTATION_TOOLS.has(toolName))
}

export function classifyAssistantAmbiguity(text, options = {}) {
  const input = normalizeAssistantLanguage(text)
  if (!input || options.hasActiveEntity === true) return null

  const actionLanguage = /\b(?:add|book|cancel|change|create|delete|edit|fix|get|move|put|remove|reschedule|schedule|set|shift|update)\b/.test(input)
  const vagueTarget = /\b(?:it|stuff|the thing|that thing|the other thing|the other one|something)\b/.test(input)
  if (actionLanguage && vagueTarget) {
    return {
      kind: 'vague_action_target',
      text: 'I can help, but I need the specific calendar event or grocery item and the change you want.',
    }
  }

  return null
}
