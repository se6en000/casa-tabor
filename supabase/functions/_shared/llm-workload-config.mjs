import {
  BACKGROUND_GEMINI_MODEL,
  PRIMARY_GEMINI_MODEL,
  TALK_PLAN_GEMINI_MODEL,
  isProductionGeminiModel,
} from './llm-model-policy.mjs'

export const LLM_REASONING_PRESETS = ['fast', 'balanced', 'deep']
export const LLM_WORKLOADS = ['do', 'talk_plan', 'background']

const DEFAULT_PRESET_BY_WORKLOAD = {
  do: 'balanced',
  talk_plan: 'deep',
  background: 'fast',
}

function normalizeProvider(value) {
  return String(value ?? 'gemini').trim().toLowerCase()
}

function normalizedModel(value, fallback) {
  const model = String(value ?? '').trim().toLowerCase()
  return model || fallback
}

function validatePreset(value, fallback) {
  const preset = String(value ?? fallback).trim().toLowerCase()
  if (!LLM_REASONING_PRESETS.includes(preset)) {
    throw new Error(`Unsupported reasoning preset: ${preset}`)
  }
  return preset
}

export function normalizeLlmWorkloadConfig(config = {}) {
  const provider = normalizeProvider(config.provider)
  const model = normalizedModel(config.model, provider === 'gemini' ? PRIMARY_GEMINI_MODEL : '')
  return {
    ...config,
    provider,
    model,
    background_model: normalizedModel(config.background_model, provider === 'gemini' ? BACKGROUND_GEMINI_MODEL : model),
    talk_plan_model: normalizedModel(config.talk_plan_model, provider === 'gemini' ? TALK_PLAN_GEMINI_MODEL : model),
    do_reasoning_preset: String(config.do_reasoning_preset ?? DEFAULT_PRESET_BY_WORKLOAD.do).trim().toLowerCase(),
    talk_plan_reasoning_preset: String(config.talk_plan_reasoning_preset ?? DEFAULT_PRESET_BY_WORKLOAD.talk_plan).trim().toLowerCase(),
    background_reasoning_preset: String(config.background_reasoning_preset ?? DEFAULT_PRESET_BY_WORKLOAD.background).trim().toLowerCase(),
  }
}

function thinkingFor(model, preset) {
  if (model === TALK_PLAN_GEMINI_MODEL) {
    return {
      kind: 'level',
      value: preset === 'deep' ? 'high' : 'medium',
    }
  }
  const budgets = {
    fast: 0,
    balanced: 256,
    deep: 1024,
  }
  return { kind: 'budget', value: budgets[preset] }
}

export function resolveLlmWorkload(rawConfig = {}, workload) {
  if (!LLM_WORKLOADS.includes(workload)) {
    throw new Error(`Unsupported LLM workload: ${workload}`)
  }
  const config = normalizeLlmWorkloadConfig(rawConfig)
  const modelField = workload === 'do'
    ? 'model'
    : workload === 'talk_plan'
      ? 'talk_plan_model'
      : 'background_model'
  const presetField = workload === 'do'
    ? 'do_reasoning_preset'
    : workload === 'talk_plan'
      ? 'talk_plan_reasoning_preset'
      : 'background_reasoning_preset'
  const model = config[modelField]
  const preset = validatePreset(config[presetField], DEFAULT_PRESET_BY_WORKLOAD[workload])

  if (config.provider === 'gemini' && !isProductionGeminiModel(model)) {
    throw new Error(`Unsupported Gemini model: ${model}`)
  }

  return {
    workload,
    provider: config.provider,
    model,
    preset,
    apiFamily: 'generateContent',
    thinking: config.provider === 'gemini' ? thinkingFor(model, preset) : { kind: 'none', value: null },
  }
}
