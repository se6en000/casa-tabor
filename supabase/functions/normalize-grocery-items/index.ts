import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GroceryItemRow = {
  id: string
  name: string
  category: string
  checked: boolean
  deleted_at: string | null
  last_modified_source: string
}

type LlmConfig = {
  provider?: string
  model?: string
  api_key?: string
}

const COMMON_GROCERY_WORDS = new Set([
  'riced', 'cauliflower', 'frozen', 'milk', 'whole', 'skim', 'bread', 'eggs', 'egg', 'chicken', 'beef', 'fish',
  'lettuce', 'spinach', 'onion', 'garlic', 'tomato', 'potato', 'rice', 'pasta', 'cheese', 'butter', 'yogurt',
  'berries', 'strawberries', 'blueberries', 'apples', 'bananas', 'oranges', 'carrots', 'broccoli', 'pepper',
  'peppers', 'cucumber', 'mushroom', 'mushrooms', 'coffee', 'tea', 'water', 'sparkling', 'juice', 'soda', 'oil',
  'olive', 'avocado', 'salt', 'sugar', 'flour', 'oats', 'cereal', 'beans', 'lentils', 'tortilla', 'tortillas',
  'bagel', 'bagels', 'pizza', 'fries', 'waffles', 'ice', 'cream', 'ground', 'turkey', 'sausage', 'bacon',
])

function normalizeComparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function tokenize(name: string): string[] {
  return name.toLowerCase().split(/[^a-z]+/).filter(Boolean)
}

function isSuspiciousName(name: string): boolean {
  const tokens = tokenize(name)
  if (tokens.length < 2) return false
  const unknownLongTokens = tokens.filter((token) => token.length >= 5 && !COMMON_GROCERY_WORDS.has(token))
  return unknownLongTokens.length > 0
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1))
  }
  throw new Error('Model did not return JSON')
}

async function callLlm(config: Required<LlmConfig>, prompt: string): Promise<string> {
  const provider = (config.provider || 'gemini').toLowerCase()
  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
    const data = await res.json()
    const parts = (data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
    return parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() ?? ''
  }

  throw new Error(`Unsupported provider: ${provider}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { item_ids: itemIdsRaw } = await req.json().catch(() => ({ item_ids: [] }))
    const itemIds = Array.isArray(itemIdsRaw)
      ? itemIdsRaw.filter((id) => typeof id === 'string' && id.trim().length > 0)
      : []
    if (itemIds.length === 0) {
      return new Response(JSON.stringify({ success: true, corrected_count: 0, reason: 'no_ids' }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const uniqueIds = Array.from(new Set(itemIds)).slice(0, 60)

    const { data: rows, error: rowsError } = await sb
      .from('grocery_items')
      .select('id, name, category, checked, deleted_at, last_modified_source')
      .in('id', uniqueIds)

    if (rowsError) throw new Error(rowsError.message)

    const activeRows = ((rows ?? []) as GroceryItemRow[]).filter((row) =>
      !row.checked && !row.deleted_at && row.last_modified_source === 'casa'
    )
    const suspicious = activeRows.filter((row) => isSuspiciousName(row.name)).slice(0, 20)
    if (suspicious.length === 0) {
      return new Response(JSON.stringify({ success: true, corrected_count: 0, reason: 'no_suspicious_items' }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const { data: cfgRows, error: cfgError } = await sb.from('settings').select('value').eq('key', 'llm_config').limit(1)
    if (cfgError) throw new Error(cfgError.message)
    const config = (cfgRows?.[0]?.value ?? {}) as LlmConfig
    if (!config.api_key) {
      return new Response(JSON.stringify({
        success: true,
        corrected_count: 0,
        reason: 'no_llm_key',
        scanned_count: suspicious.length,
      }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const provider = config.provider ?? 'gemini'
    const model =
      config.model ??
      (provider === 'openai'
        ? 'gpt-4o-mini'
        : provider === 'anthropic'
          ? 'claude-3-5-haiku-latest'
          : 'gemini-1.5-flash')

    const prompt = [
      'You clean up likely speech-to-text mistakes in grocery item names.',
      'Only correct obvious mistakes. Keep wording short and grocery-like.',
      'If uncertain, keep original.',
      'Return strict JSON: {"corrections":[{"id":"...","corrected_name":"...","confidence":0.0}]}',
      'Use confidence 0..1. Only include entries where correction is meaningfully better.',
      '',
      'Candidates:',
      ...suspicious.map((item) => `${item.id} | ${item.name} | ${item.category}`),
    ].join('\n')

    const modelResponse = await callLlm(
      { provider, model, api_key: config.api_key },
      prompt,
    )
    const parsed = parseJsonObject(modelResponse)
    const corrections = Array.isArray(parsed.corrections) ? parsed.corrections : []
    const candidateById = new Map(suspicious.map((item) => [item.id, item]))

    const approved = corrections.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return []
      const id = typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : ''
      const correctedNameRaw =
        typeof (raw as { corrected_name?: unknown }).corrected_name === 'string'
          ? (raw as { corrected_name: string }).corrected_name
          : ''
      const confidenceRaw = Number((raw as { confidence?: unknown }).confidence ?? 0)
      const original = candidateById.get(id)
      if (!original) return []
      const correctedName = correctedNameRaw.trim().replace(/\s+/g, ' ')
      if (!correctedName) return []
      if (confidenceRaw < 0.86) return []
      if (normalizeComparableName(correctedName) === normalizeComparableName(original.name)) return []
      return [{ id, original_name: original.name, corrected_name: correctedName, confidence: confidenceRaw }]
    })

    for (const item of approved) {
      const { error } = await sb
        .from('grocery_items')
        .update({
          name: item.corrected_name,
          last_modified_source: 'casa',
        })
        .eq('id', item.id)
      if (error) throw new Error(error.message)
    }

    return new Response(JSON.stringify({
      success: true,
      scanned_count: suspicious.length,
      corrected_count: approved.length,
      corrections: approved,
      provider,
      model,
    }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message ?? 'normalize-grocery-items failed',
    }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
