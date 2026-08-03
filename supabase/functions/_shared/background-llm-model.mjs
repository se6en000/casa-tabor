import { BACKGROUND_GEMINI_MODEL } from './llm-model-policy.mjs'

export { BACKGROUND_GEMINI_MODEL }

export function resolveBackgroundLlmConfig(config = {}) {
  const provider = String(config?.provider ?? 'gemini').trim().toLowerCase()
  return {
    ...config,
    provider,
    model: provider === 'gemini'
      ? BACKGROUND_GEMINI_MODEL
      : String(config?.model ?? '').trim(),
  }
}
