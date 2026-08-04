import { BACKGROUND_GEMINI_MODEL, resolveProductionGeminiModel } from './llm-model-policy.mjs'

export { BACKGROUND_GEMINI_MODEL }

// Reads the user-selected background model (config.background_model, set from
// AI Settings) and falls back to the previous hardcoded default when unset —
// existing settings rows without this field keep their current behavior
// exactly. For Gemini, the selection is still pinned through
// resolveProductionGeminiModel so an unpinned/mutable/expensive alias can
// never reach production regardless of what's stored.
export function resolveBackgroundLlmConfig(config = {}) {
  const provider = String(config?.provider ?? 'gemini').trim().toLowerCase()
  const requestedBackgroundModel = String(config?.background_model ?? '').trim().toLowerCase()
  const primaryModel = String(config?.model ?? '').trim()
  return {
    ...config,
    provider,
    model: provider === 'gemini'
      ? resolveProductionGeminiModel(requestedBackgroundModel, BACKGROUND_GEMINI_MODEL)
      : (requestedBackgroundModel || primaryModel),
  }
}
