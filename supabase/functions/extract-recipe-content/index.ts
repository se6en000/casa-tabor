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
  image_urls?: string[]
  source_excerpt?: string | null
  confidence: number
}

async function fetchMealDbImage(name: string): Promise<string | null> {
  const query = name.trim()
  if (!query) return null
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`)
    if (!res.ok) return null
    const data = await res.json()
    const firstMeal = Array.isArray(data?.meals) ? data.meals[0] : null
    const thumb = typeof firstMeal?.strMealThumb === 'string' ? firstMeal.strMealThumb.trim() : ''
    return thumb || null
  } catch {
    return null
  }
}

function buildRecipeFallbackImage(name: string): string {
  const lock = encodeURIComponent(name.trim().toLowerCase() || 'recipe')
  return `https://loremflickr.com/1200/900/food?lock=${lock}`
}

function normalizeUniqueImageUrls(raw: unknown[]): string[] {
  const seen = new Set<string>()
  for (const row of raw) {
    if (typeof row !== 'string') continue
    const cleaned = row.trim()
    if (!cleaned) continue
    seen.add(cleaned)
  }
  return Array.from(seen)
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
    .map((step, index) => ({ ...step, step_number: index + 1 }))

  const imageUrls = normalizeUniqueImageUrls([
    ...(Array.isArray(payload.image_urls) ? payload.image_urls : []),
    payload.image_url,
  ])
  return {
    name,
    ingredients,
    steps,
    servings: typeof payload.servings === 'string' ? payload.servings.trim() || null : null,
    cook_time: typeof payload.cook_time === 'string' ? payload.cook_time.trim() || null : null,
    image_url: imageUrls[0] ?? null,
    image_urls: imageUrls,
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
  const coerceImageUrls = (value: unknown): string[] => {
    if (typeof value === 'string') return value.trim() ? [value.trim()] : []
    if (Array.isArray(value)) {
      const list: string[] = []
      for (const item of value) {
        const fromItem = coerceImageUrls(item)
        if (fromItem.length > 0) list.push(...fromItem)
      }
      return normalizeUniqueImageUrls(list)
    }
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>
      return coerceImageUrls(row.url ?? row.contentUrl)
    }
    return []
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

      const imageUrls = coerceImageUrls(recipe.image)
      return {
        name,
        ingredients,
        steps,
        servings: typeof recipe.recipeYield === 'string' ? recipe.recipeYield : null,
        cook_time: typeof recipe.totalTime === 'string' ? recipe.totalTime : null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        source_excerpt: null,
        confidence: 0.96,
      }
    }

  }
  return null
}

function readOgImage(html: string): string | null {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
  return match?.[1]?.trim() || null
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
    'Extract a cooking recipe from the provided content in strict OCR/LITERAL mode.',
    'Return strict JSON:',
    '{"name":"...","servings":"...","cook_time":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}],"source_excerpt":"...","confidence":0.0}',
    'Do not paraphrase, summarize, infer, or rewrite recipe content.',
    'Ingredients: copy raw_text exactly from source lines (spelling, punctuation, order).',
    'Steps: copy instruction wording exactly as written and keep original order.',
    'If text is unclear, keep best-effort literal text and use [illegible] for unreadable words instead of guessing.',
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
    'Extract recipe information from this file in strict OCR/LITERAL mode.',
    'Return strict JSON:',
    '{"name":"...","servings":"...","cook_time":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}],"source_excerpt":"...","confidence":0.0}',
    'Do not paraphrase, summarize, infer, or rewrite recipe content.',
    'For scanned recipes, preserve exact wording and order from the source.',
    'Ingredients raw_text must be copied exactly from visible lines.',
    'Steps must preserve original wording and order. Use [illegible] for unreadable words instead of guessing.',
  ].join('\n')

  const raw = await callGeminiJson(config, [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: fileBase64 } },
  ])
  const parsed = parseJsonObject(raw)
  return normalizeExtractedRecipe(parsed, fallbackName)
}

async function extractFromBinaryBatchWithLlm(
  config: Required<LlmConfig>,
  files: Array<{ file_base64: string; mime_type: string }>,
  fallbackName: string,
): Promise<ExtractedRecipe> {
  if (files.length === 0) throw new Error('At least one file is required')
  const prompt = [
    'Extract one complete recipe from the provided files (multiple photos/pages of the same recipe) in strict OCR/LITERAL mode.',
    'Do not paraphrase, summarize, infer, or rewrite recipe content.',
    'Preserve ingredient and step wording exactly as written in source and keep source order.',
    'Only remove exact duplicate lines caused by overlapping photos of the same line.',
    'Use [illegible] for unreadable words instead of guessing.',
    'Return strict JSON:',
    '{"name":"...","servings":"...","cook_time":"...","ingredients":[{"raw_text":"...","name":"...","quantity":"...","unit":"...","optional":false}],"steps":[{"step_number":1,"instruction":"..."}],"source_excerpt":"...","confidence":0.0}',
  ].join('\n')

  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  for (const file of files) {
    parts.push({
      inline_data: {
        mime_type: file.mime_type,
        data: file.file_base64,
      },
    })
  }
  const raw = await callGeminiJson(config, parts)
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
      files: filesRaw,
      meal_photo_index: mealPhotoIndexRaw,
      mime_type: mimeTypeRaw,
      fallback_name: fallbackNameRaw,
    } = await req.json().catch(() => ({}))

    const sourceType = String(sourceTypeRaw ?? '').trim().toLowerCase()
    if (!['url', 'image', 'pdf'].includes(sourceType)) {
      throw new Error('source_type must be one of: url, image, pdf')
    }

    const sourceUrl = String(sourceUrlRaw ?? '').trim()
    const fileBase64 = String(fileBase64Raw ?? '').trim()
    const files = Array.isArray(filesRaw) ? filesRaw : []
    const normalizedFiles = files
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const item = row as Record<string, unknown>
        const data = String(item.file_base64 ?? '').trim()
        const mime = String(item.mime_type ?? '').trim()
        if (!data) return null
        return {
          file_base64: data,
          mime_type: mime || 'image/jpeg',
        }
      })
      .filter((row): row is { file_base64: string; mime_type: string } => row !== null)
    const mealPhotoIndex = mealPhotoIndexRaw === null || mealPhotoIndexRaw === undefined || mealPhotoIndexRaw === ''
      ? null
      : Number(mealPhotoIndexRaw)
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
      if (normalizedFiles.length > 0) {
        const filesForExtraction = normalizedFiles.map((file) => ({
          file_base64: file.file_base64,
          mime_type: sourceType === 'pdf' ? 'application/pdf' : file.mime_type || 'image/jpeg',
        }))
        extracted = await extractFromBinaryBatchWithLlm(llmConfig, filesForExtraction, fallbackName)
      } else {
        if (!fileBase64) throw new Error('file_base64 or files[] is required for image/pdf imports')
        const resolvedMime = sourceType === 'pdf' ? 'application/pdf' : (mimeType || 'image/jpeg')
        extracted = await extractFromBinaryWithLlm(llmConfig, fileBase64, resolvedMime, fallbackName)
      }
    }

    if (!sourceExcerpt) {
      sourceExcerpt = extracted.source_excerpt ?? ''
    }

    const imageCandidates = normalizeUniqueImageUrls([
      ...(Array.isArray(extracted.image_urls) ? extracted.image_urls : []),
      extracted.image_url,
    ])
    extracted.image_urls = imageCandidates

    if (!extracted.image_url) {
      const mealDbImage = await fetchMealDbImage(extracted.name)
      extracted.image_url = mealDbImage ?? buildRecipeFallbackImage(extracted.name)
    }
    if (extracted.image_url && !extracted.image_urls.includes(extracted.image_url)) {
      extracted.image_urls.unshift(extracted.image_url)
    }
    if (normalizedFiles.length > 0 && mealPhotoIndex !== null && Number.isFinite(mealPhotoIndex)) {
      const boundedMealPhotoIndex = Math.max(0, Math.min(Math.floor(mealPhotoIndex), normalizedFiles.length - 1))
      const selectedFile = normalizedFiles[boundedMealPhotoIndex]
      if (selectedFile) {
        const dataUrl = `data:${selectedFile.mime_type};base64,${selectedFile.file_base64}`
        if (!extracted.image_urls.includes(dataUrl)) extracted.image_urls.unshift(dataUrl)
        extracted.image_url = dataUrl
      }
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
