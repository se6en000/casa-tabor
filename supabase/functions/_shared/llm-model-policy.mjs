export const PRIMARY_GEMINI_MODEL = 'gemini-2.5-flash'
export const BACKGROUND_GEMINI_MODEL = 'gemini-2.5-flash-lite'

const PRODUCTION_GEMINI_MODELS = new Set([
  PRIMARY_GEMINI_MODEL,
  BACKGROUND_GEMINI_MODEL,
])

export function isProductionGeminiModel(model) {
  return PRODUCTION_GEMINI_MODELS.has(String(model ?? '').trim().toLowerCase())
}

export function resolveProductionGeminiModel(model, fallback = PRIMARY_GEMINI_MODEL) {
  const normalized = String(model ?? '').trim().toLowerCase()
  return PRODUCTION_GEMINI_MODELS.has(normalized) ? normalized : fallback
}
