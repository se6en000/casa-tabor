const DIRECTORY_ROLE_OR_SERVICE = /\b(?:air conditioning|allergist|barber|coach|counselor|dentist|dermatologist|doctor|instructor|ophthalmologist|optometrist|orthodontist|pediatric(?:ian|s)?|physician|provider|psychiatrist|psychologist|teacher|therapist|tutor|veterinarian|vet|dr\.?)\b/i
const DIRECTORY_QUESTION = /\b(?:address|based|call|contact|location|meet(?:ing)?|number|phone|put it|where|who|usually)\b/i
const DIRECTORY_MEMORY_QUESTION = /\b(?:what do you know about|what(?:'s| is) the address for|where do (?:we|i) usually|who should i call about)\b/i
const FAMILY_PLACE_PATTERN = /\b(?:what|which)\s+(?:\w+\s+){0,3}places?\b[\s\S]*\busually\b/i
const FAMILY_PROVIDER_LIST_PATTERN = /\b(?:list|name|other|what|which)\b[\s\S]{0,80}\b(?:coaches|counselors|dentists|dermatologists|doctors|orthodontists|providers|therapists|tutors|vets|veterinarians)\b/i

export function isHouseholdDirectoryQuestion(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  return DIRECTORY_MEMORY_QUESTION.test(input) ||
    FAMILY_PLACE_PATTERN.test(input) ||
    FAMILY_PROVIDER_LIST_PATTERN.test(input) ||
    (DIRECTORY_ROLE_OR_SERVICE.test(input) && DIRECTORY_QUESTION.test(input))
}
