/**
 * analyze-prep — scans the next 10 days of events and uses AI to generate
 * proactive preparation reminders for the family.
 *
 * Examples:
 *  🎁  "Emma's birthday party is in 4 days — have you picked up a gift yet?"
 *  👕  "Soccer game Saturday — is Liam's uniform clean and his cleats packed?"
 *  🍲  "Block party Sunday — you signed up to bring a dish. Time to plan!"
 *  🌧️  "Outdoor recital Thursday — 70% chance of rain, bring umbrellas"
 *  📋  "Field trip tomorrow — permission slip needs to be returned today"
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  // ── Load family members ──
  const { data: members } = await sb
    .from('family_members')
    .select('id, name, role')
    .order('sort_order')
  if (!members) return err('Failed to load family members')

  // ── Load upcoming events with enrichment ──
  const { data: events, error: evErr } = await sb
    .from('events')
    .select(`
      id, title, start_time, end_time, location_name, description,
      event_members(family_member_id, role),
      event_enrichments(
        what_to_bring, prep_notes, outfit_suggestion,
        dietary_notes, special_instructions, cost_estimate,
        weather_summary, category
      )
    `)
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .neq('status', 'cancelled')
    .order('start_time')

  if (evErr) return err(`Events query failed: ${evErr.message}`)
  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ ok: true, found: 0, debug: 'no events in window' }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // ── Load LLM config ──
  const { data: cfgRow } = await sb.from('settings').select('value').eq('key', 'llm_config').single()
  const config = cfgRow?.value ?? { provider: 'gemini', model: 'gemini-1.5-flash', api_key: '' }

  // ── Build event context for LLM ──
  const familyNames = members.map((m: { name: string; role: string }) => `${m.name} (${m.role})`).join(', ')

  type EventRow = {
    id: string; title: string; start_time: string; end_time: string;
    location_name: string | null; description: string | null;
    event_members: { family_member_id: string; role: string }[];
    event_enrichments: {
      what_to_bring?: string[]; prep_notes?: string | null; outfit_suggestion?: string | null;
      dietary_notes?: string | null; special_instructions?: string | null;
      cost_estimate?: number | null; weather_summary?: string | null; category?: string | null;
    } | null;
  }

  const eventsBlock = (events as EventRow[]).map((ev) => {
    const start = new Date(ev.start_time)
    const daysAway = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const memberNames = (ev.event_members ?? [])
      .map((m) => members.find((fm: { id: string }) => fm.id === m.family_member_id)?.name ?? m.family_member_id)
      .join(', ')
    const enr = ev.event_enrichments
    const enrichLines = [
      enr?.category ? `Category: ${enr.category}` : '',
      enr?.what_to_bring?.length ? `Bring: ${(enr.what_to_bring as string[]).join(', ')}` : '',
      enr?.outfit_suggestion ? `Outfit: ${enr.outfit_suggestion}` : '',
      enr?.dietary_notes ? `Dietary: ${enr.dietary_notes}` : '',
      enr?.special_instructions ? `Special: ${enr.special_instructions}` : '',
      enr?.prep_notes ? `PrepNotes: ${enr.prep_notes}` : '',
      enr?.cost_estimate ? `Cost: $${enr.cost_estimate}` : '',
      enr?.weather_summary ? `Weather: ${enr.weather_summary}` : '',
    ].filter(Boolean).join(' | ')

    return `EVENT_ID:${ev.id} | "${ev.title}" | ${daysAway} day(s) away | Who: ${memberNames || 'unassigned'}${ev.location_name ? ` | At: ${ev.location_name}` : ''}${ev.description ? ` | Notes: ${ev.description}` : ''}${enrichLines ? ` | ${enrichLines}` : ''}`
  }).join('\n')

  const prompt = `You are a ruthlessly selective family alert AI. Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

Family members: ${familyNames}

UPCOMING EVENTS (next 14 days):
${eventsBlock}

Your task: Surface ONLY the prep items that, if missed, would cause genuine stress, embarrassment, or real harm. This is a VERY HIGH bar. Most events should produce zero alerts.

RAISE AN ALERT for:
- Birthdays or birthday parties → gift not yet a given (raise this 5+ days ahead)
- Social parties/celebrations where showing up empty-handed would be rude (dish, gift, bottle of wine, etc.)
- Serious medical appointments: surgery, specialist consultation, procedure, ER follow-up — NOT routine checkups, ortho adjustments, or annual physicals
- Travel or overnight trips → bags, logistics, passports, pet care
- Events requiring a paid registration, ticket, or fee that may not be secured yet
- Events the family genuinely cannot attend without advance action (e.g. permission slip, RSVP deadline)

DO NOT raise alerts for:
- Routine sports practices (soccer practice, batting practice, open practice, etc.)
- Routine medical/dental checkups, orthodontist adjustments, annual physicals
- Reminders to pack a water bottle or wear sunscreen
- Anything a normal parent would handle in 5 minutes the morning of
- "Be on time" or "remember to go"

When in doubt, DO NOT raise the alert. Fewer, higher-quality alerts are far better than a noisy list.

Return ONLY a JSON array (no markdown, no prose):
[
  {
    "event_id": "<exact EVENT_ID from above>",
    "type": "gift|dish|travel|forms|payment|rsvp|medical|general",
    "emoji": "<single relevant emoji>",
    "description": "<specific, 1-sentence alert using real names — what needs to happen and why it matters>",
    "priority": <1=low|2=medium|3=critical>
  }
]

If nothing clears the bar, return [].`

  const rawText = await callLLM(config, prompt)
  const text = rawText.trim()
  console.log('[analyze-prep] LLM raw response length:', text.length)

  let prepItems: { event_id: string; type: string; emoji: string; description: string; priority: number }[] = []
  try {
    // Try direct parse first (cleanest path after code-fence stripping)
    if (text.startsWith('[')) {
      prepItems = JSON.parse(text)
    } else {
      // Fall back to extracting the outermost array
      const jsonStart = text.indexOf('[')
      const jsonEnd = text.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        prepItems = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
      } else {
        console.error('[analyze-prep] No JSON array found. Text:', text.slice(0, 500))
      }
    }
  } catch (e) {
    console.error('[analyze-prep] Failed to parse LLM JSON:', text.slice(0, 500), e)
    return err(`Failed to parse AI response: ${String(e)} | text: ${text.slice(0, 200)}`)
  }

  // Validate event IDs
  const validEventIds = new Set((events as EventRow[]).map((e) => e.id))
  const eventMap = new Map((events as EventRow[]).map((e) => [e.id, e]))
  const validItems = prepItems.filter((item) => validEventIds.has(item.event_id))

  // ── Find already-dismissed or snoozed items for these events ──
  // Don't re-create prep items the user has already dealt with.
  const { data: existingDismissed } = await sb
    .from('prep_items')
    .select('event_id, type')
    .in('event_id', [...validEventIds])
    .eq('dismissed', true)

  const dismissedKeys = new Set(
    (existingDismissed ?? []).map((r: { event_id: string; type: string }) => `${r.event_id}::${r.type}`)
  )

  // ── Clear old undismissed prep items for these events ──
  if (validEventIds.size > 0) {
    await sb.from('prep_items').delete()
      .eq('dismissed', false)
      .in('event_id', [...validEventIds])
  }

  // ── Insert new items, skipping anything already dismissed ──
  const newItems = validItems.filter(
    (item) => !dismissedKeys.has(`${item.event_id}::${item.type}`)
  )

  if (newItems.length > 0) {
    const rows = newItems.map((item) => {
      const ev = eventMap.get(item.event_id)!
      return {
        event_id: item.event_id,
        type: item.type,
        emoji: item.emoji,
        description: item.description,
        event_title: ev.title,
        event_date: ev.start_time,
        due_by: ev.start_time,
        priority: item.priority ?? 2,
        dismissed: false,
      }
    })
    await sb.from('prep_items').insert(rows)
  }

  return new Response(
    JSON.stringify({ ok: true, found: newItems.length, skipped_dismissed: validItems.length - newItems.length }),
    { headers: { ...CORS, 'content-type': 'application/json' } },
  )
})

function err(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

async function callLLM(config: { provider: string; model: string; api_key: string }, prompt: string): Promise<string> {
  if (config.provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.4,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    )
    const data = await res.json()
    if (!res.ok || data.error) {
      console.error('[analyze-prep] Gemini API error:', JSON.stringify(data).slice(0, 500))
      return ''
    }
    // Filter out thinking parts (gemini-2.5+), only keep answer parts
    const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
    // Strip markdown code fences (handles ```json ... ``` wrapping)
    return text.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim()
  }
  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.4,
      }),
    })
    const data = await res.json()
    return (data.choices?.[0]?.message?.content ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  }
  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return (data.content?.[0]?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  }
  return '[]'
}
