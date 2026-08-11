import { BACKGROUND_GEMINI_MODEL } from './llm-model-policy.mjs'
import { resolveLlmWorkload } from './llm-workload-config.mjs'

export { BACKGROUND_GEMINI_MODEL }

// Reads the user-selected background model (config.background_model, set from
// AI Settings) and falls back to the previous hardcoded default when unset —
// existing settings rows without this field keep their current behavior
// exactly. For Gemini, the selection is still pinned through
// resolveProductionGeminiModel so an unpinned/mutable/expensive alias can
// never reach production regardless of what's stored.
export function resolveBackgroundLlmConfig(config = {}) {
  const resolved = resolveLlmWorkload(config, 'background')
  return {
    ...config,
    provider: resolved.provider,
    model: resolved.model,
  }
}
