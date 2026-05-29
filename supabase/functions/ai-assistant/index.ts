import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message { role: 'user' | 'assistant'; content: string }
interface ImagePayload { mimeType: string; data: string } // raw base64, no data: prefix
interface Context {
  page: string
  currentDate: string
  utcOffset: string
  events: EventSummary[]
  family: FamilyMember[]
  homeCity?: string
}
interface EventSummary {
  id: string
  title: string
  start_time: string
  end_time: string
  location_name: string | null
  members: string[] // names
  category: string | null
}
interface FamilyMember { id: string; name: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { messages, context, image }: { messages: Message[]; context: Context; image?: ImagePayload } = await req.json()

  // Load LLM config
  const { data: cfgRow } = await sb.from('settings').select('value').eq('key', 'llm_config').single()
  const config = cfgRow?.value ?? { provider: 'gemini', model: 'gemini-1.5-flash', api_key: '' }

  // Build system context block
  const familyNames = context.family.map(f => f.name).join(', ')
  const eventsBlock = context.events.length === 0
    ? 'No events.'
    : context.events.map(e => {
        const start = new Date(e.start_time)
        const end = new Date(e.end_time)
        const fmt = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        return `- ID:${e.id} | "${e.title}" | ${fmt(start)} – ${fmt(end)}${e.location_name ? ` | ${e.location_name}` : ''}${e.members.length ? ` | Who: ${e.members.join(', ')}` : ''}${e.category ? ` | ${e.category}` : ''}`
      }).join('\n')

  const systemPrompt = `You are the Casa Tabor family assistant — a helpful, concise, warm AI for the ${familyNames} family. 
Current date/time: ${context.currentDate}
User's local UTC offset: ${context.utcOffset ?? '-04:00'} (IMPORTANT: all times you generate MUST use this offset, e.g. "2026-05-28T20:00:00${context.utcOffset ?? '-04:00'}")
Current page: ${context.page}
Home city: ${context.homeCity ?? 'unknown'}

EVENTS IN VIEW:
${eventsBlock}

FAMILY MEMBERS: ${familyNames}

You can either:
1. Answer questions conversationally about the events, schedule, or family.
2. Analyze an attached image — describe what you see and relate it to the family calendar if relevant (e.g. a school flyer, game schedule, invitation, or screenshot of a calendar).
3. Take an ACTION by responding with ONLY a JSON array (even for a single action) — no prose, no markdown fences:

[
  {"action":"create_event","title":"<Owner> | <Concise Description>","start":"<ISO with offset>","end":"<ISO with offset>","location":"<place or null>","members":["<name>"],"needs_clarification":"<question or null>"}
]

For updating: [{"action":"update_event","id":"<event id>","changes":{"title":"...","start":"...","end":"...","location":"..."},"needs_clarification":"<or null>"}]
For deleting: [{"action":"delete_event","id":"<event id>","title":"<title for confirmation>","needs_clarification":"<or null>"}]
For multiple events: return multiple objects in the same array.

Rules:
- ALWAYS wrap actions in a JSON array [ ], even for a single action.
- If the user's intent is clearly an action (create/update/delete) AND you have all the info needed, return the JSON array.
- If you need more info (e.g. who is attending, what time), include needs_clarification on the relevant action.
- For event titles use the format: <Owner First Name> | <Concise Description in Title Case>
- Default the owner to the first family member (${context.family[0]?.name ?? 'Jake'}) if not specified.
- For times, use the current date as the base if the user says "tonight" or "today".
- Otherwise answer conversationally, be brief (1-3 sentences max), warm, and smart.
- Never make up events that aren't in the list.`

  // Build conversation prompt
  const conversationHistory = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const fullPrompt = `${systemPrompt}\n\nCONVERSATION:\n${conversationHistory}\nAssistant:`

  const raw = await callLLM(config, fullPrompt, image)
  const text = raw.trim()

  // Try to detect if response is a JSON action array (or single object)
  const arrStart = text.indexOf('[')
  const arrEnd = text.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      const actions = JSON.parse(text.slice(arrStart, arrEnd + 1))
      if (Array.isArray(actions) && actions.length > 0 && actions[0]?.action) {
        return new Response(JSON.stringify({ type: 'multi_action', actions }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }
    } catch (_) { /* fall through */ }
  }
  // Fallback: single JSON object (legacy)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const action = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
      if (action.action) {
        return new Response(JSON.stringify({ type: 'multi_action', actions: [action] }), {
          headers: { ...CORS, 'content-type': 'application/json' },
        })
      }
    } catch (_) { /* fall through to text response */ }
  }

  return new Response(JSON.stringify({ type: 'text', text }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

async function callLLM(
  config: { provider: string; model: string; api_key: string },
  prompt: string,
  image?: ImagePayload,
): Promise<string> {
  if (config.provider === 'gemini') {
    // Build parts array — image first (if present) then text
    const parts: unknown[] = []
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
    }
    parts.push({ text: prompt })

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.5,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await res.json()
    const resParts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    return resParts.filter(p => !p.thought).map(p => p.text ?? '').join('')
  }

  if (config.provider === 'openai') {
    // Build message content — array if image present, string otherwise
    type OAIContent = string | { type: string; text?: string; image_url?: { url: string } }[]
    const content: OAIContent = image
      ? [
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
          { type: 'text', text: prompt },
        ]
      : prompt

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content }], max_tokens: 600, temperature: 0.5 }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  if (config.provider === 'anthropic') {
    type AnthropicContent = string | { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[]
    const content: AnthropicContent = image
      ? [
          { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } },
          { type: 'text', text: prompt },
        ]
      : prompt

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 600, messages: [{ role: 'user', content }] }),
    })
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  return ''
}
