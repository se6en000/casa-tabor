import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

type ExtractedRecipe = {
  name: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  servings?: string | null
  cook_time?: string | null
  image_url?: string | null
  source_excerpt?: string | null
  confidence: number
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Model returned empty response')
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1))
  }
  throw new Error('Model did not return JSON')
}

function normalizeIngredient(raw: unknown, index: number): RecipeIngredient | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const value = raw.trim()
    if (!value) return null
    return { raw_text: value }
  }
  if (typeof raw === 'object') {
    const row = raw as Record<string, unknown>
    const rawText = String(row.raw_text ?? row.raw ?? row.ingredient ?? '').trim()
    if (!rawText) return null
    return {
      raw_text: rawText,
      name: typeof row.name === 'string' ? row.name.trim() || null : null,
      quantity: typeof row.quantity === 'string' ? row.quantity.trim() || null : null,
      unit: typeof row.unit === 'string' ? row.unit.trim() || null : null,
      optional: Boolean(row.optional),
    }
  }
  return null
}

function normalizeStep(raw: unknown, index: number): RecipeStep | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const value = raw.trim()
    if (!value) return null
    return { step_number: index + 1, instruction: value }
  }
  if (typeof raw === 'object') {
    const row = raw as Record<string, unknown>
    const value = String(row.instruction ?? row.text ?? row.step ?? '').trim()
    if (!value) return null
    const stepNumber = Number(row.step_number ?? row.position ?? index + 1)
    return {
      step_number: Number.isFinite(stepNumber) && stepNumber > 0 ? Math.floor(stepNumber) : index + 1,
      instruction: value,
    }
  }
  return null
}

function normalizeExtractedRecipe(payload: Record<string, unknown>, fallbackName: string): ExtractedRecipe {
  const name = String(payload.name ?? payload.title ?? fallbackName).trim() || fallbackName
  const ingredientsRaw = Array.isArray(payload.ingredients) ? payload.ingredients : []
  const stepsRaw = Array.isArray(payload.steps) ? payload.steps : []
  const ingredients = ingredientsRaw
    .map((row, index) => normalizeIngredient(row, index))
    .filter((row): row is RecipeIngredient => row !== null)
  const steps = stepsRaw
    .map((row, index) => normalizeStep(row, index))
    .filter((row): row is RecipeStep => row !== null)
    .sort((a, b) => a.step_number - b.step_number)
    .map((step, index) => ({ ...step, step_number: index + 1 }))

  return {
    name,
    ingredients,
    steps,
    servings: typeof payload.servings === 'string' ? payload.servings.trim() || null : null,
    cook_time: typeof payload.cook_time === 'string' ? payload.cook_time.trim() || null : null,
    image_url: typeof payload.image_url === 'string' ? payload.image_url.trim() || null : null,
    source_excerpt: typeof payload.source_excerpt === 'string' ? payload.source_excerpt.trim() || null : null,
    confidence: Math.max(0, Math.min(1, Number(payload.confidence ?? 0.7) || 0.7)),
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function readRecipeFromJsonLd(html: string): ExtractedRecipe | null {
  const coerceImageUrl = (value: unknown): string | null => {
    if (typeof value === 'string') return value.trim() || null
    if (Array.isArray(value)) {
      for (const item of value) {
        const fromItem = coerceImageUrl(item)
        if (fromItem) return fromItem
      }
      return null
    }
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>
      return coerceImageUrl(row.url ?? row.contentUrl)
    }
    return null
  }

  const scripts = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
  for (const match of scripts) {
    const block = (match[1] ?? '').trim()
    if (!block) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(block)
    } catch {
      continue
    }

    const nodes = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>)['@graph'])
        ? ((parsed as Record<string, unknown>)['@graph'] as unknown[])
        : [parsed]

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const recipe = node as Record<string, unknown>
      const typeRaw = recipe['@type']
      const types = Array.isArray(typeRaw) ? typeRaw.map((value) => String(value)) : [String(typeRaw ?? '')]
      const isRecipe = types.some((type) => type.toLowerCase() === 'recipe')
      if (!isRecipe) continue

      const name = String(recipe.name ?? '').trim()
      if (!name) continue

      const ingredientSource = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []
      const ingredients = ingredientSource
        .map((item, index) => normalizeIngredient(item, index))
        .filter((item): item is RecipeIngredient => item !== null)

      const instructionSource = recipe.recipeInstructions
      const instructionItems = Array.isArray(instructionSource) ? instructionSource : [instructionSource]
      const steps = instructionItems
        .flatMap((entry) => {
          if (typeof entry === 'string') return [entry]
          if (entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).itemListElement)) {
            return (entry as Record<string, unknown>).itemListElement as unknown[]
          }
          return [entry]
        })
        .map((item, index) => {
          if (typeof item === 'string') return normalizeStep(item, index)
          if (item && typeof item === 'object') {
            const row = item as Record<string, unknown>
            return normalizeStep({
              step_number: row.position,
              instruction: row.text ?? row.name,
            }, index)
          }
          return null
        })
        .filter((item): item is RecipeStep => item !== null)

      if (ingredients.length === 0 || steps.length === 0) continue

      return {
        name,
        ingredients,
        steps,
        servings: typeof recipe.recipeYield === 'string' ? recipe.recipeYield : null,
        cook_time: typeof recipe.totalTime === 'string' ? recipe.totalTime : null,
        image_url: coerceImageUrl(recipe.image),
        source_excerpt: null,
        confidence: 0.96,
      }
    }

    function readOgImage(html: string): string | null {
      const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
      return match?.[1]?.trim() || null
    }
  }
  return null
}

async function callGeminiJson(config: Required<LlmConfig>, parts: Array<Record<string, unknown>>): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status})`)
  }
  const data = await res.json()
  const responseParts = (data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
  return responseParts.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
}

async function extractFromTextWithLlm(config: Required<LlmConfig>, text: string, fallbackName: string): Promise<ExtractedRecipe> {
  const prompt = [
    'Extract a cooking recipe from the provided content.',
    'Return strict JSON:',
    '{"name":"...","servings":"...","cook_time":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}],"source_excerpt":"...","confidence":0.0}',
    'Keep ingredient raw_text exactly as seen when possible.',
    'Steps must be ordered and concise.',
    '',
    'Content:',
    text.slice(0, 18000),
  ].join('\n')

  const raw = await callGeminiJson(config, [{ text: prompt }])
  const parsed = parseJsonObject(raw)
  return normalizeExtractedRecipe(parsed, fallbackName)
}

async function extractFromBinaryWithLlm(
  config: Required<LlmConfig>,
  fileBase64: string,
  mimeType: string,
  fallbackName: string,
): Promise<ExtractedRecipe> {
  const prompt = [
    'Extract recipe information from this file.',
    'Return strict JSON:',
    '{"name":"...","servings":"...","cook_time":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}],"source_excerpt":"...","confidence":0.0}',
    'For scanned recipes: infer clean ingredient names and instruction steps.',
  ].join('\n')

  const raw = await callGeminiJson(config, [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: fileBase64 } },
  ])
  const parsed = parseJsonObject(raw)
  return normalizeExtractedRecipe(parsed, fallbackName)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const {
      source_type: sourceTypeRaw,
      source_url: sourceUrlRaw,
      file_base64: fileBase64Raw,
      mime_type: mimeTypeRaw,
      fallback_name: fallbackNameRaw,
    } = await req.json().catch(() => ({}))

    const sourceType = String(sourceTypeRaw ?? '').trim().toLowerCase()
    if (!['url', 'image', 'pdf'].includes(sourceType)) {
      throw new Error('source_type must be one of: url, image, pdf')
    }

    const sourceUrl = String(sourceUrlRaw ?? '').trim()
    const fileBase64 = String(fileBase64Raw ?? '').trim()
    const mimeType = String(mimeTypeRaw ?? '').trim()
    const fallbackName = String(fallbackNameRaw ?? 'Imported recipe').trim() || 'Imported recipe'

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: cfgRows, error: cfgError } = await sb.from('settings').select('value').eq('key', 'llm_config').limit(1)
    if (cfgError) throw new Error(cfgError.message)
    const config = (cfgRows?.[0]?.value ?? {}) as LlmConfig
    if (!config.api_key) throw new Error('No LLM API key configured')

    const provider = String(config.provider ?? 'gemini').toLowerCase()
    if (provider !== 'gemini') {
      throw new Error('Recipe import currently requires Gemini provider for image/PDF parsing')
    }

    const model = config.model ?? 'gemini-1.5-flash'
    const llmConfig: Required<LlmConfig> = { provider, model, api_key: config.api_key }

    let extracted: ExtractedRecipe
    let sourceExcerpt = ''

    if (sourceType === 'url') {
      if (!sourceUrl) throw new Error('source_url is required for url imports')
      const res = await fetch(sourceUrl, { redirect: 'follow' })
      if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`)
      const html = await res.text()
      const jsonLdRecipe = readRecipeFromJsonLd(html)
      if (jsonLdRecipe) {
        extracted = jsonLdRecipe
      } else {
        const plainText = stripHtmlToText(html)
        sourceExcerpt = plainText.slice(0, 1000)
        extracted = await extractFromTextWithLlm(llmConfig, plainText, fallbackName)
        extracted.image_url = readOgImage(html)
      }
    } else {
      if (!fileBase64) throw new Error('file_base64 is required for image/pdf imports')
      const resolvedMime = sourceType === 'pdf' ? 'application/pdf' : (mimeType || 'image/jpeg')
      extracted = await extractFromBinaryWithLlm(llmConfig, fileBase64, resolvedMime, fallbackName)
    }

    if (!sourceExcerpt) {
      sourceExcerpt = extracted.source_excerpt ?? ''
    }

    const { error: importError } = await sb
      .from('recipe_import_runs')
      .insert({
        source_type: sourceType,
        source_url: sourceUrl || null,
        source_excerpt: sourceExcerpt || null,
        parsed_name: extracted.name,
        parsed_payload: extracted as unknown as Record<string, unknown>,
        confidence: extracted.confidence,
      })
    if (importError) throw new Error(importError.message)

    return new Response(
      JSON.stringify({
        success: true,
        recipe: extracted,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message ?? 'extract-recipe-content failed',
      }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
