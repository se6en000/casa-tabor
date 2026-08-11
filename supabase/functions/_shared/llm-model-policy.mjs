export const PRIMARY_GEMINI_MODEL = 'gemini-2.5-flash'
export const BACKGROUND_GEMINI_MODEL = 'gemini-2.5-flash-lite'
export const TALK_PLAN_GEMINI_MODEL = 'gemini-3.6-flash'
// Opt-in "better" tier: stronger reasoning/multimodal understanding, higher
// latency and cost. Never used as a fallback default — only selectable when
// a user explicitly sets it via AI Settings.
export const ADVANCED_GEMINI_MODEL = 'gemini-2.5-pro'

const PRODUCTION_GEMINI_MODELS = new Set([
  PRIMARY_GEMINI_MODEL,
  BACKGROUND_GEMINI_MODEL,
  ADVANCED_GEMINI_MODEL,
  TALK_PLAN_GEMINI_MODEL,
])

export function isProductionGeminiModel(model) {
  return PRODUCTION_GEMINI_MODELS.has(String(model ?? '').trim().toLowerCase())
}

export function resolveProductionGeminiModel(model, fallback = PRIMARY_GEMINI_MODEL) {
  const normalized = String(model ?? '').trim().toLowerCase()
  return PRODUCTION_GEMINI_MODELS.has(normalized) ? normalized : fallback
}
