// Role words allow an optional trailing "s" so plural natural phrasing
// ("who are Liv's doctors?") matches the same as singular ("who is Liv's
// doctor?").
const DIRECTORY_ROLE_OR_SERVICE = /\b(?:air conditioning|allergists?|barbers?|coach(?:es)?|counselors?|dentists?|dermatologists?|doctors?|instructors?|ophthalmologists?|optometrists?|orthodontists?|pediatric(?:ian|ians|s)?|physicians?|providers?|psychiatrists?|psychologists?|teachers?|therapists?|tutors?|veterinarians?|vets?|dr\.?)\b/i
const DIRECTORY_QUESTION = /\b(?:address|based|call|contact|location|meet(?:ing)?|number|phone|put it|where|who|usually)\b/i
const DIRECTORY_MEMORY_QUESTION = /\b(?:what do you know about|what(?:'s| is) the address for|where do (?:we|i) usually|who should i call about)\b/i
const FAMILY_PLACE_PATTERN = /\b(?:what|which)\s+(?:\w+\s+){0,3}places?\b[\s\S]*\busually\b/i
const FAMILY_PROVIDER_LIST_PATTERN = /\b(?:list|name|other|what|which|who)\b[\s\S]{0,80}\b(?:coaches|counselors|dentists|dermatologists|doctors|orthodontists|providers|therapists|tutors|vets|veterinarians)\b/i

export function isHouseholdDirectoryQuestion(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  return DIRECTORY_MEMORY_QUESTION.test(input) ||
    FAMILY_PLACE_PATTERN.test(input) ||
    FAMILY_PROVIDER_LIST_PATTERN.test(input) ||
    (DIRECTORY_ROLE_OR_SERVICE.test(input) && DIRECTORY_QUESTION.test(input))
}

// Short affirmations/continuations ("can you guess?", "sure, guess", "just
// take a guess") carry no role word of their own — they only make sense as a
// reply to a prior directory question. Callers should combine this with a
// check that the *previous* user turn was a household directory question
// before inheriting its role/member context.
const DIRECTORY_FOLLOW_UP_LANGUAGE = /\b(?:guess|your best guess|take a guess|go ahead|please do)\b/i

export function isDirectoryFollowUpLanguage(text) {
  const input = String(text ?? '').trim()
  if (!input) return false
  return DIRECTORY_FOLLOW_UP_LANGUAGE.test(input)
}
