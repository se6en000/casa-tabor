const DIRECTORY_ROLE_OR_SERVICE = /\b(?:air conditioning|barber|coach|dentist|doctor|orthodontist|pediatric(?:ian|s)?|provider|teacher|therapist)\b/i
const DIRECTORY_QUESTION = /\b(?:address|based|call|contact|location|meet(?:ing)?|number|phone|put it|where|who|usually)\b/i
const DIRECTORY_MEMORY_QUESTION = /\b(?:what do you know about|where do (?:we|i) usually|who should i call about)\b/i
const FAMILY_PLACE_PATTERN = /\b(?:what|which)\s+(?:\w+\s+){0,3}places?\b[\s\S]*\busually\b/i

export function isHouseholdDirectoryQuestion(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  return DIRECTORY_MEMORY_QUESTION.test(input) ||
    FAMILY_PLACE_PATTERN.test(input) ||
    (DIRECTORY_ROLE_OR_SERVICE.test(input) && DIRECTORY_QUESTION.test(input))
}
