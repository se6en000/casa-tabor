import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const providerFetch = createTrackedProviderFetch({
  functionName: 'recipe-edit-assistant',
  capability: 'recipe-editing',
  trafficClass: 'user',
})

type LlmConfig = {
  provider?: string
  model?: string
  api_key?: string
}

type RecipeIngredient = {
  raw_text: string
  name?: string | null
  quantity?: string | null
  unit?: string | null
  optional?: boolean
}

type RecipeStep = {
  step_number: number
  instruction: string
}

type RecipePayload = {
  name: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
}

type SuggestedQuickAction = {
  name: string
  description?: string | null
  field: 'quantity' | 'unit' | 'name' | 'raw_text'
  pattern: string
  replacement: string
  flags?: string | null
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Model returned empty response')
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
  throw new Error('Model did not return JSON')
}

function normalizeIngredient(raw: unknown): RecipeIngredient | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const rawText = String(row.raw_text ?? '').trim()
  const name = typeof row.name === 'string' ? row.name.trim() || null : null
  const quantity = typeof row.quantity === 'string' ? row.quantity.trim() || null : null
  const unit = typeof row.unit === 'string' ? row.unit.trim() || null : null
  if (!rawText && !name) return null
  return {
    raw_text: rawText || [quantity, unit, name].filter(Boolean).join(' ').trim(),
    name,
    quantity,
    unit,
    optional: Boolean(row.optional),
  }
}

function normalizeStep(raw: unknown, index: number): RecipeStep | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const instruction = String(row.instruction ?? '').trim()
  if (!instruction) return null
  return { step_number: index + 1, instruction }
}

function normalizeRecipe(payload: Record<string, unknown>, fallbackName: string): RecipePayload {
  const name = String(payload.name ?? fallbackName).trim() || fallbackName
  const ingredientsRaw = Array.isArray(payload.ingredients) ? payload.ingredients : []
  const stepsRaw = Array.isArray(payload.steps) ? payload.steps : []
  const ingredients = ingredientsRaw
    .map((row) => normalizeIngredient(row))
    .filter((row): row is RecipeIngredient => row !== null)
  const steps = stepsRaw
    .map((row, index) => normalizeStep(row, index))
    .filter((row): row is RecipeStep => row !== null)
    .map((step, index) => ({ ...step, step_number: index + 1 }))
  return { name, ingredients, steps }
}

function normalizeSuggestedQuickAction(raw: unknown): SuggestedQuickAction | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const field = String(row.field ?? '').trim()
  if (!['quantity', 'unit', 'name', 'raw_text'].includes(field)) return null
  const pattern = String(row.pattern ?? '').trim()
  if (!pattern) return null
  return {
    name: String(row.name ?? 'AI quick action').trim() || 'AI quick action',
    description: typeof row.description === 'string' ? row.description : null,
    field: field as SuggestedQuickAction['field'],
    pattern,
    replacement: String(row.replacement ?? ''),
    flags: typeof row.flags === 'string' ? row.flags : null,
  }
}

async function callGeminiJson(config: Required<LlmConfig>, prompt: string): Promise<string> {
  const res = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`)
  const data = await res.json()
  const parts = (data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
  return parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const payload = await req.json().catch(() => ({}))
    const instruction = String(payload?.instruction ?? '').trim()
    if (!instruction) throw new Error('instruction is required')
    const recipeRaw = payload?.recipe as Record<string, unknown> | undefined
    if (!recipeRaw || typeof recipeRaw !== 'object') throw new Error('recipe is required')

    const currentRecipe = normalizeRecipe(recipeRaw, 'Recipe')
    if (currentRecipe.ingredients.length === 0) throw new Error('recipe must include ingredients')

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: cfgRows, error: cfgError } = await sb.from('settings').select('value').eq('key', 'llm_config').limit(1)
    if (cfgError) throw new Error(cfgError.message)
    const config = resolveBackgroundLlmConfig(cfgRows?.[0]?.value) as LlmConfig
    if (!config.api_key) throw new Error('No LLM API key configured')
    const provider = String(config.provider ?? 'gemini').toLowerCase()
    if (provider !== 'gemini') throw new Error('recipe-edit-assistant currently supports Gemini only')
    const llmConfig: Required<LlmConfig> = {
      provider,
      model: config.model ?? 'gemini-1.5-flash',
      api_key: config.api_key,
    }

    const prompt = [
      'You are editing a structured recipe draft.',
      'Apply the user instruction exactly to recipe name, ingredients, and steps.',
      'Preserve ordering unless user asks to reorder.',
      'Do not fabricate ingredients or steps.',
      'If user asks for quantity split using "|" separators, update quantity/unit/name fields accordingly.',
      'Return strict JSON only in this shape:',
      '{"recipe":{"name":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}]},"suggested_quick_action":{"name":"...","description":"...","field":"quantity","pattern":"...","replacement":"...","flags":"g"}|null}',
      'suggested_quick_action should be null unless there is a reusable regex transformation pattern.',
      '',
      `Instruction: ${instruction}`,
      '',
      `Current recipe JSON: ${JSON.stringify(currentRecipe)}`,
    ].join('\n')

    const raw = await callGeminiJson(llmConfig, prompt)
    const parsed = parseJsonObject(raw)
    const recipeResultRaw = parsed.recipe
    const nextRecipe = normalizeRecipe(
      recipeResultRaw && typeof recipeResultRaw === 'object' ? recipeResultRaw as Record<string, unknown> : {},
      currentRecipe.name,
    )
    if (nextRecipe.ingredients.length === 0) throw new Error('AI edit returned no ingredients')
    if (nextRecipe.steps.length === 0) throw new Error('AI edit returned no steps')
    const suggested = normalizeSuggestedQuickAction(parsed.suggested_quick_action)

    return new Response(
      JSON.stringify({
        success: true,
        recipe: nextRecipe,
        suggested_quick_action: suggested,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'recipe-edit-assistant failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
