import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  // Client sends UTC ISO strings for local-day boundaries so timezone is always correct.
  // e.g. for EDT (UTC-4): dayStartUtc = "2026-05-30T04:00:00.000Z", dayEndUtc = "2026-05-31T03:59:59.999Z"
  let dayStartUtc: string, dayEndUtc: string, localDate: string
  try {
    const body = await req.json().catch(() => ({}))
    dayStartUtc = body.dayStartUtc ?? new Date().toISOString()
    dayEndUtc   = body.dayEndUtc   ?? new Date().toISOString()
    localDate   = body.localDate   ?? new Date().toISOString().slice(0, 10)
  } catch {
    dayStartUtc = new Date().toISOString()
    dayEndUtc   = new Date().toISOString()
    localDate   = new Date().toISOString().slice(0, 10)
  }
  const today = localDate

  // Load LLM config and weather config from settings
  const { data: settingRow } = await sb.from('settings').select('value').eq('key', 'llm_config').single()
  const llmConfig = (settingRow?.value ?? {}) as { provider: string; model: string; api_key: string }
  const { data: weatherSetting } = await sb.from('settings').select('value').eq('key', 'weather').maybeSingle()
  const weatherCity: string = weatherSetting?.value?.city ?? ''

  // Load today's events — use UTC boundaries computed by client for local-day accuracy
  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, all_day, location_name, description, event_members(family_member_id, family_members(name, color_hex)), event_enrichments(prep_notes, category, what_to_bring, weather_at_event, outfit_suggestion, cost_estimate, dietary_notes)')
    .gte('start_time', dayStartUtc)
    .lte('start_time', dayEndUtc)
    .eq('status', 'confirmed')
    .order('start_time')

  if (evErr) return new Response(JSON.stringify({ error: evErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  // Load family members for the schedule grouping
  const { data: familyMembers } = await sb.from('family_members').select('id, name, color_hex').order('sort_order')

  // Build per-member schedule map
  const memberSchedules: Record<string, { name: string; color_hex: string; events: unknown[] }> = {}
  for (const m of familyMembers ?? []) {
    memberSchedules[m.id] = { name: m.name, color_hex: m.color_hex, events: [] }
  }
  for (const ev of events ?? []) {
    for (const em of ev.event_members ?? []) {
      const memberId = em.family_member_id
      if (memberSchedules[memberId]) {
        memberSchedules[memberId].events.push({
          title: ev.title,
          start_time: ev.start_time,
          end_time: ev.end_time,
          all_day: ev.all_day,
          location_name: ev.location_name,
          enrichment: ev.event_enrichments?.[0] ?? null,
        })
      }
    }
  }

  // Load active prep items for today or upcoming (not dismissed)
  const { data: prepItems } = await sb
    .from('prep_items')
    .select('description, type, emoji, event_title, event_date, priority')
    .eq('dismissed', false)
    .gte('event_date', today + 'T00:00:00Z')
    .lte('event_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T23:59:59Z')
    .order('priority', { ascending: false })
    .limit(5)

  // Generate AI summary if key is configured
  let summaryText = ''
  if (llmConfig?.api_key && llmConfig?.provider) {
    try {
      summaryText = await callLLM(llmConfig, today, events ?? [], familyMembers ?? [], weatherCity, prepItems ?? [])
    } catch (err) {
      console.error('LLM error:', err)
      summaryText = ''
    }
  }

  // Upsert to daily_briefings
  const briefingRow = {
    briefing_date: today,
    summary_text: summaryText,
    content_json: { member_schedules: memberSchedules, events_count: (events ?? []).length },
    member_schedules: memberSchedules,
    conflicts: [],
    generated_by: llmConfig?.provider ? `${llmConfig.provider}/${llmConfig.model}` : 'none',
    updated_at: new Date().toISOString(),
  }
  const { data: briefing, error: bErr } = await sb
    .from('daily_briefings')
    .upsert(briefingRow, { onConflict: 'briefing_date' })
    .select()
    .single()

  if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  return new Response(JSON.stringify({ ok: true, briefing }), { headers: { ...CORS, 'content-type': 'application/json' } })
})

async function callLLM(
  config: { provider: string; model: string; api_key: string },
  date: string,
  events: unknown[],
  members: { name: string }[],
  weatherCity: string,
  prepItems: { description: string; type: string; emoji: string; event_title: string; event_date: string; priority: number }[],
): Promise<string> {
  const dateLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const memberNames = members.map(m => m.name).join(', ')

  type EventRow = {
    title: string
    start_time: string
    end_time: string
    all_day: boolean
    location_name: string | null
    description: string | null
    event_members: { family_members: { name: string } }[]
    event_enrichments: {
      category?: string | null
      what_to_bring?: string[] | null
      outfit_suggestion?: string | null
      weather_at_event?: string | null
      prep_notes?: string | null
      cost_estimate?: number | null
      dietary_notes?: string | null
    }[] | null
  }

  const eventLines = (events as EventRow[])
    .map(ev => {
      const time = ev.all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
      const endTime = ev.all_day ? '' : ` – ${new Date(ev.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}`
      const who = ev.event_members?.map(em => em.family_members?.name).filter(Boolean).join(', ') || 'family'
      const where = ev.location_name ? ` at ${ev.location_name}` : ''
      const enr = ev.event_enrichments?.[0]
      const extras = [
        enr?.what_to_bring?.length ? `bring: ${(enr.what_to_bring as string[]).join(', ')}` : '',
        enr?.outfit_suggestion ? `outfit: ${enr.outfit_suggestion}` : '',
        enr?.weather_at_event ? `weather: ${enr.weather_at_event}` : '',
        enr?.prep_notes ? `notes: ${enr.prep_notes}` : '',
        ev.description ? `desc: ${ev.description}` : '',
      ].filter(Boolean).join(' | ')
      return `  ${time}${endTime}: ${ev.title}${where} (${who})${extras ? ` [${extras}]` : ''}`
    })
    .join('\n')

  const prepLines = prepItems.length > 0
    ? prepItems.map(p => `  ${p.emoji} ${p.description}`).join('\n')
    : ''

  const prompt = `You are the Casa Tabor family command center. Write a warm, smart morning briefing for ${dateLabel} for the ${memberNames} family.${weatherCity ? ` They live in ${weatherCity}.` : ''}

TODAY'S SCHEDULE:
${eventLines || '  No events scheduled today.'}
${prepLines ? `\nACTIVE PREP REMINDERS (things that need attention soon):
${prepLines}` : ''}

Write a single flowing paragraph (4–6 sentences) that covers:
1. A quick read of the day's energy — busy or calm?
2. Who's going where and when — mention names, times, and locations naturally
3. Any logistics or timing pressure (back-to-back events, driving needed, tight windows)
4. Any weather-related considerations for outdoor events if relevant
5. A nod to any prep reminders that need attention today or this week (only if prep items exist above)
6. A closing note — encouraging, grounding, or practical

Write in a warm, confident voice like a knowledgeable household manager. Use family member names. No bullet points. No headers. Just one great paragraph.`

  if (config.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await res.json()
    const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    return parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
  }

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.7 }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    return data.content?.[0]?.text?.trim() ?? ''
  }

  return ''
}
