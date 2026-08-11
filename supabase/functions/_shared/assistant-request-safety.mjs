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

// App-generated draft prompts (e.g. "Create a reminder from this prep/action item…") always
// include an explicit "Title:" field plus boilerplate like "use it as-is, do not treat it as
// UTC" — that boilerplate "it" is not a vague pronoun reference, it's part of a fully-specified
// structured request. Detect the labeled-field pattern on the raw (pre-normalization) text,
// since normalization strips the colon.
const STRUCTURED_DRAFT_FIELD = /\btitle\s*:\s*\S/i

export function classifyAssistantAmbiguity(text, options = {}) {
  if (STRUCTURED_DRAFT_FIELD.test(String(text ?? ''))) return null
  if (options.experienceMode === 'talk_plan') return null
  const input = normalizeAssistantLanguage(text)
  if (!input || options.hasActiveEntity === true || options.hasGroundedSemanticIntent === true) return null

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
