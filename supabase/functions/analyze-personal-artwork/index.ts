import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const providerFetch = createTrackedProviderFetch({
  functionName: 'analyze-personal-artwork',
  capability: 'artwork-multimodal-analysis',
  trafficClass: 'background',
})

type LlmConfig = {
  provider?: string
  model?: string
  api_key?: string
}

export type ArtworkAnalysisResult = {
  title: string
  artist: string
  location: string
  date_taken: string
  medium: string
  subjects: string
  description: string
  fun_fact: string
  suggested_signature?: string
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
  throw new Error('Model did not return valid JSON')
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  const CHUNK_SIZE = 8192
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len))
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

async function callGeminiVision(
  config: Required<LlmConfig>,
  parts: Array<Record<string, unknown>>,
): Promise<string> {
  const modelName = config.model || 'gemini-2.5-flash'
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(config.api_key)

  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  const res = await providerFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error('Gemini Vision API error (' + res.status + '): ' + (errText || res.statusText))
  }

  const json = await res.json()
  const responseParts = (json.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
  const text = responseParts.filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim()
  if (!text) {
    throw new Error('Gemini Vision returned empty content')
  }
  return text
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error('Failed to fetch image from URL (' + res.status + '): ' + imageUrl)
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const base64 = uint8ArrayToBase64(bytes)
  return { base64, mimeType: contentType }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      image_url: imageUrlRaw,
      file_base64: fileBase64Raw,
      mime_type: mimeTypeRaw,
      hint: hintRaw,
      current_title: currentTitleRaw,
      current_artist: currentArtistRaw,
    } = body

    let fileBase64 = String(fileBase64Raw || '').trim()
    let mimeType = String(mimeTypeRaw || 'image/jpeg').trim()
    const imageUrl = String(imageUrlRaw || '').trim()
    const userHint = String(hintRaw || '').trim()
    const currentTitle = String(currentTitleRaw || '').trim()
    const currentArtist = String(currentArtistRaw || '').trim()

    if (!fileBase64 && imageUrl) {
      const fetched = await fetchImageAsBase64(imageUrl)
      fileBase64 = fetched.base64
      mimeType = fetched.mimeType
    }

    if (!fileBase64 && !imageUrl && !userHint) {
      throw new Error('An image (URL or base64) or a descriptive hint is required for AI analysis')
    }

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: cfgRows, error: cfgError } = await sb
      .from('settings')
      .select('value')
      .eq('key', 'llm_config')
      .limit(1)

    if (cfgError) throw new Error(cfgError.message)
    const config = resolveBackgroundLlmConfig(cfgRows?.[0]?.value) as LlmConfig
    const apiKey = config.api_key || Deno.env.get('GEMINI_API_KEY') || ''
    if (!apiKey) throw new Error('No Gemini API key configured in Casa settings')

    const provider = String(config.provider ?? 'gemini').toLowerCase()
    const model = config.model ?? 'gemini-2.5-flash'
    const llmConfig: Required<LlmConfig> = { provider, model, api_key: apiKey }

    const promptText = [
      'You are the elite art curator, photo archivist, and cultural historian for Casa (a luxury household operating system screensaver and fine art collection).',
      'Your task is to analyze the attached photograph / artwork along with any optional context or hints from the collector, and provide rich, museum-grade archival metadata.',
      '',
      'CONTEXT PROVIDED BY COLLECTOR:',
      '- User Hint / Notes: ' + (userHint || '(None provided)'),
      '- Current Title: ' + (currentTitle || '(Untitled)'),
      '- Current Artist: ' + (currentArtist || '(Unset)'),
      '',
      'CURATION GUIDELINES:',
      '1. IDENTIFICATION & RECOGNITION:',
      '   - Identify the photograph if it is a known iconic work (e.g. Slim Aarons, Ansel Adams, Henri Cartier-Bresson, Peter Beard, Richard Avedon, Bert Stern, Lynn Goldsmith, Julius Shulman, vintage Palm Springs / Capri / French Riviera / Acapulco / Hollywood lifestyle).',
      '   - If it is a personal/family photograph, deduce the setting, era, mood, and aesthetic composition from visual cues and user hints.',
      '2. TITLE:',
      '   - Provide an elegant, evocative, canonical title (e.g. "Poolside Gossip", "Dining Al Fresco on Capri", "Summer in Positano", "Highland Cattle at Sunrise"). Avoid generic names like "Photo 1" or raw filenames.',
      '3. ARTIST / PHOTOGRAPHER:',
      '   - If recognized, output the real photographer/artist name (e.g. "Slim Aarons", "Lynn Goldsmith").',
      '   - If a personal or unidentified family photograph, provide the suggested name or "Personal collection".',
      '4. LOCATION & SETTING:',
      '   - Be specific: include estate/resort/landmark if identifiable, plus city/region and country (e.g. "Kaufmann Desert House, Palm Springs, California" or "Villa Nirvana, Las Brisas, Acapulco, Mexico").',
      '5. DATE / YEAR:',
      '   - Provide exact date, month & year, or decade (e.g. "January 1970", "September 1968", "circa 1965", "Summer 1984").',
      '6. MEDIUM / FORMAT:',
      '   - Specify the photographic medium or artistic format (e.g. "35mm Kodachrome Color Photograph", "Medium Format Ektachrome Slide", "Vintage Gelatin Silver Print", "Archival C-Type Color Photograph").',
      '7. KEY FIGURES & SUBJECTS:',
      '   - List notable subjects, socialites, celebrities, patrons, or architectural motifs present in the shot (e.g. "Nelda Linsk, Helen Dzo Dzo Kaptur, Lita Baron", "Clark Gable, Gary Cooper, James Stewart").',
      '8. HISTORICAL BACKGROUND & STORY (2-3 sentences):',
      '   - Write a rich, engaging curatorial narrative detailing the composition, historical moment, aesthetic atmosphere, and context of the image.',
      '9. INSIDER TRIVIA / FUN FACT (1-2 sentences):',
      '   - Provide a fascinating behind-the-scenes anecdote, trivia fact, or cultural legacy note.',
      '10. SIGNATURE TEXT:',
      '    - Suggest a tasteful inscription/signature (e.g. "Slim Aarons 70" or "Capri - 1968").',
      '',
      'RETURN STRICT JSON matching this exact schema:',
      '{',
      '  "title": "Evocative Title",',
      '  "artist": "Photographer or Artist Name",',
      '  "location": "Specific Location, City, Country",',
      '  "date_taken": "Date or Year",',
      '  "medium": "Photographic Format / Medium",',
      '  "subjects": "Comma-separated key figures or subjects",',
      '  "description": "Curatorial story and aesthetic context",',
      '  "fun_fact": "Fascinating trivia or behind-the-scenes fact",',
      '  "suggested_signature": "Suggested signature inscription",',
      '  "confidence": 0.95',
    ].join('\n')

    const parts: Array<Record<string, unknown>> = [{ text: promptText }]
    if (fileBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: fileBase64,
        },
      })
    }

    const rawResponse = await callGeminiVision(llmConfig, parts)
    const parsed = parseJsonObject(rawResponse)

    const result: ArtworkAnalysisResult = {
      title: String(parsed.title || currentTitle || 'Untitled Artwork').trim(),
      artist: String(parsed.artist || currentArtist || 'Personal collection').trim(),
      location: String(parsed.location || '').trim(),
      date_taken: String(parsed.date_taken || '').trim(),
      medium: String(parsed.medium || 'Color photograph').trim(),
      subjects: String(parsed.subjects || '').trim(),
      description: String(parsed.description || '').trim(),
      fun_fact: String(parsed.fun_fact || '').trim(),
      suggested_signature: parsed.suggested_signature ? String(parsed.suggested_signature).trim() : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: result,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (err) {
    console.error('analyze-personal-artwork error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: (err as Error).message ?? 'Failed to analyze artwork',
      }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})
