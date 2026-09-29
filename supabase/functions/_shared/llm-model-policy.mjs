export const PRIMARY_GEMINI_MODEL = 'gemini-2.5-flash'
export const BACKGROUND_GEMINI_MODEL = 'gemini-2.5-flash-lite'
export const TALK_PLAN_GEMINI_MODEL = 'gemini-2.5-flash'
// Opt-in models: selectable in AI Settings, but never used as fallback defaults
export const ADVANCED_GEMINI_MODEL = 'gemini-2.5-pro'
export const HIGH_REASONING_GEMINI_MODEL = 'gemini-3.6-flash'

const PRODUCTION_GEMINI_MODELS = new Set([
  PRIMARY_GEMINI_MODEL,
  BACKGROUND_GEMINI_MODEL,
  ADVANCED_GEMINI_MODEL,
  HIGH_REASONING_GEMINI_MODEL,
])

export function isProductionGeminiModel(model) {
  return PRODUCTION_GEMINI_MODELS.has(String(model ?? '').trim().toLowerCase())
}

export function resolveProductionGeminiModel(model, fallback = PRIMARY_GEMINI_MODEL) {
  const normalized = String(model ?? '').trim().toLowerCase()
  return PRODUCTION_GEMINI_MODELS.has(normalized) ? normalized : fallback
}

// Talking something through (P3.25 "Plan it with Casa"): the fast model hands the turn over with its
// think_it_through tool. Chosen 2026-09-29 on the same planning openers: concrete ideas with a pick,
// the family and the Florida weather, push back — where 2.5 Flash mostly asked questions back.
// (2.5 Pro is no longer available to new users.)
export const PLANNING_GEMINI_MODEL = 'gemini-3.6-flash'
