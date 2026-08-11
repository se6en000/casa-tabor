import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, invocationHeaders, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { verifyProfileSessionToken } from '../_shared/profile-session.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-casa-history-session',
}
const providerFetch = createTrackedProviderFetch({
  functionName: 'generate-briefing',
  capability: 'briefing',
  trafficClass: 'background',
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const correlationId = getCorrelationId(req, 'briefing')
  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const profileToken = req.headers.get('x-casa-history-session')?.trim()
    if (!profileToken) return new Response(
      JSON.stringify({ error: 'Profile session is required.', correlation_id: correlationId }),
      { status: 401, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
    let profileSession: { role: string; member_id: string | null }
    try {
      profileSession = await verifyProfileSessionToken({
        token: profileToken,
        secret: requireEnv('AI_HISTORY_SESSION_SECRET'),
        loadCredentialVersion: async (claims: { role: string; member_id: string | null }) => {
          const query = sb
            .from('ai_history_pin_credentials')
            .select('credential_version')
            .eq('credential_kind', claims.role)
          const { data, error } = claims.role === 'family_member'
            ? await query.eq('member_id', claims.member_id).maybeSingle()
            : await query.is('member_id', null).maybeSingle()
          if (error) throw error
          return data?.credential_version ?? null
        },
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          correlation_id: correlationId,
        }),
        { status: 401, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
      )
    }
    if (profileSession.role !== 'family_member' || !profileSession.member_id) {
      return new Response(
        JSON.stringify({ error: 'A family member profile is required.', correlation_id: correlationId }),
        { status: 403, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
      )
    }
    const memberId = profileSession.member_id

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
  const llmConfig = resolveBackgroundLlmConfig(settingRow?.value) as {
    provider: string
    model: string
    api_key?: string
  }
  const { data: weatherSetting } = await sb.from('settings').select('value').eq('key', 'weather').maybeSingle()
  const weatherCity: string = weatherSetting?.value?.city ?? ''

  // Run canonical orchestration pipeline first so conflicts/prep/weather are refreshed together.
  const sevenDaysOut = new Date(new Date(dayStartUtc).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: orchestrationData, error: orchestrationError } = await sb.functions.invoke('orchestrate-household', {
    body: { range_start: dayStartUtc, range_end: sevenDaysOut },
    headers: invocationHeaders(correlationId),
  })
  if (orchestrationError) {
    console.error(`[generate-briefing][${correlationId}] orchestration invoke failed:`, orchestrationError.message)
  }

  // Load today's events — use UTC boundaries computed by client for local-day accuracy
  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, all_day, location_name, description, event_members(family_member_id, family_members(name, color_hex)), event_enrichments(prep_notes, category, weather_at_event, outfit_suggestion, cost_estimate, dietary_notes), event_checklist_items(label, checked, sort_order)')
    .is('deleted_at', null)
    .gte('start_time', dayStartUtc)
    .lte('start_time', dayEndUtc)
    .eq('status', 'confirmed')
    .order('start_time')

  if (evErr) return new Response(
    JSON.stringify({ error: evErr.message, correlation_id: correlationId }),
    { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
  )

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
          checklist: ev.event_checklist_items ?? [],
        })
      }
    }
  }

  // Fallback prep query if orchestration didn't return prep items.
  const { data: prepItemsFallback } = await sb
    .from('prep_items')
    .select('description, type, emoji, event_title, event_date, priority')
    .eq('dismissed', false)
    .gte('event_date', today + 'T00:00:00Z')
    .lte('event_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T23:59:59Z')
    .order('priority', { ascending: false })
    .limit(5)

  const prepItems = (orchestrationData?.prep_items as {
    description: string
    type: string
    emoji: string
    event_title: string
    event_date: string
    priority: number
  }[] | undefined) ?? prepItemsFallback ?? []

  const actionQueue = (orchestrationData?.action_queue as {
    type: string
    priority: number
    title: string
    description: string
    due_at: string
    event_id: string | null
  }[] | undefined) ?? []

  const knowledgeHorizon = new Date(new Date(dayStartUtc).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: emailCommitments, error: emailCommitmentsError } = await sb
    .from('family_knowledge_claims')
    .select('title, summary, expires_at, family_members(name), canonical_inbox_emails(from_email, subject)')
    .eq('status', 'active')
    .eq('requiredness', 'required')
    .eq('privacy_class', 'standard')
    .or(`expires_at.is.null,expires_at.lte.${knowledgeHorizon}`)
    .or(`expires_at.is.null,expires_at.gte.${dayStartUtc}`)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .limit(6)
  if (emailCommitmentsError) return new Response(
    JSON.stringify({ error: emailCommitmentsError.message, correlation_id: correlationId }),
    { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
  )

  const { data: memoryRows, error: memoryError } = await sb
    .from('ai_memories')
    .select('id,scope,title,content,category,confidence,updated_at')
    .eq('status', 'active')
    .or(`scope.eq.household,and(scope.eq.personal,owner_member_id.eq.${memberId})`)
    .order('updated_at', { ascending: false })
    .limit(12)
  if (memoryError) return new Response(
    JSON.stringify({ error: memoryError.message, correlation_id: correlationId }),
    { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
  )

  const conflicts = (orchestrationData?.conflicts as {
    id: string
    conflict_type: string
    severity: number
    description: string
  }[] | undefined) ?? []

  // Generate AI summary if key is configured
  let summaryText = ''
  if (llmConfig?.api_key && llmConfig?.provider) {
    try {
      summaryText = await callLLM(
        llmConfig as { provider: string; model: string; api_key: string },
        today,
        events ?? [],
        familyMembers ?? [],
        weatherCity,
        prepItems,
        actionQueue,
        emailCommitments ?? [],
        memoryRows ?? [],
      )
    } catch (err) {
      console.error(`[generate-briefing][${correlationId}] LLM error:`, err)
      summaryText = ''
    }
  }

  const briefingRow = {
    briefing_date: today,
    summary_text: summaryText,
    content_json: {
      member_schedules: memberSchedules,
      events_count: (events ?? []).length,
      action_queue: actionQueue,
      email_commitments: emailCommitments ?? [],
      scoped_memories: memoryRows ?? [],
      orchestration_runs: orchestrationData?.runs ?? null,
    },
    member_schedules: memberSchedules,
    conflicts,
    member_id: memberId,
    generated_by: llmConfig?.provider ? `${llmConfig.provider}/${llmConfig.model}` : 'none',
    updated_at: new Date().toISOString(),
  }
    return new Response(
      JSON.stringify({ ok: true, correlation_id: correlationId, briefing: briefingRow }),
      { headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, correlation_id: correlationId, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  }
})

async function callLLM(
  config: { provider: string; model: string; api_key: string },
  date: string,
  events: unknown[],
  members: { name: string }[],
  weatherCity: string,
  prepItems: { description: string; type: string; emoji: string; event_title: string; event_date: string; priority: number }[],
  actionQueue: { type: string; priority: number; title: string; description: string; due_at: string; event_id: string | null }[],
  emailCommitments: {
    title: string
    summary: string | null
    expires_at: string | null
    family_members: { name: string } | null
    canonical_inbox_emails: { from_email: string | null, subject: string | null } | null
  }[],
  scopedMemories: {
    id: string
    scope: 'personal' | 'household'
    title: string
    content: string
    category: string | null
    confidence: number
  }[],
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
      outfit_suggestion?: string | null
      weather_at_event?: string | null
      prep_notes?: string | null
      cost_estimate?: number | null
      dietary_notes?: string | null
    }[] | null
    event_checklist_items: {
      label: string
      checked: boolean
      sort_order: number
    }[] | null
  }

  const eventLines = (events as EventRow[])
    .map(ev => {
      const time = ev.all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
      const endTime = ev.all_day ? '' : ` – ${new Date(ev.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}`
      const who = ev.event_members?.map(em => em.family_members?.name).filter(Boolean).join(', ') || 'family'
      const where = ev.location_name ? ` at ${ev.location_name}` : ''
      const enr = ev.event_enrichments?.[0]
      const bring = (ev.event_checklist_items ?? [])
        .filter((item) => !item.checked)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => item.label)
      const extras = [
        bring.length ? `bring: ${bring.join(', ')}` : '',
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

  const actionLines = actionQueue.length > 0
    ? actionQueue.slice(0, 6).map((a) => `  [P${a.priority}] ${a.title} — ${a.description}`).join('\n')
    : ''
  const emailCommitmentLines = emailCommitments.length > 0
    ? emailCommitments.map((claim) => {
      const owner = claim.family_members?.name ? ` for ${claim.family_members.name}` : ''
      const due = claim.expires_at ? ` (due ${claim.expires_at})` : ''
      return `  ${claim.title}${owner}${due} — ${claim.summary ?? 'No additional summary'}`
    }).join('\n')
    : ''
  const scopedMemoryLines = scopedMemories.length > 0
    ? scopedMemories.map((memory) => {
      const scopeLabel = memory.scope === 'personal' ? 'personal memory' : 'household memory'
      return `  [${scopeLabel}] ${memory.title}: ${memory.content}`
    }).join('\n')
    : ''

  const prompt = `You are the Casa Tabor family command center. Write a warm, smart morning briefing for ${dateLabel} for the ${memberNames} family.${weatherCity ? ` They live in ${weatherCity}.` : ''}

TODAY'S SCHEDULE:
${eventLines || '  No events scheduled today.'}
${prepLines ? `\nACTIVE PREP REMINDERS (things that need attention soon):
${prepLines}` : ''}
${actionLines ? `\nACTION QUEUE (highest-priority items from conflict + prep + weather orchestration):
${actionLines}` : ''}
${emailCommitmentLines ? `\nEMAIL COMMITMENTS (source-backed; mention only when due or materially helpful):
${emailCommitmentLines}` : ''}
${scopedMemoryLines ? `\nSCOPED FAMILY MEMORY (include only if directly relevant; personal memory belongs only to the signed-in member):
${scopedMemoryLines}` : ''}

Write a single flowing paragraph (4–6 sentences) that covers:
1. A quick read of the day's energy — busy or calm?
2. Who's going where and when — mention names, times, and locations naturally
3. Any logistics or timing pressure (back-to-back events, driving needed, tight windows)
4. Any weather-related considerations for outdoor events if relevant
5. A nod to any prep/action items that need attention today or this week (only if prep/action inputs exist above)
6. A closing note — encouraging, grounding, or practical

Write in a warm, confident voice like a knowledgeable household manager. Use family member names. No bullet points. No headers. Just one great paragraph.`

  if (config.provider === 'gemini') {
    const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 512,
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
    const res = await providerFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.7 }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (config.provider === 'anthropic') {
    const res = await providerFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    return data.content?.[0]?.text?.trim() ?? ''
  }

  return ''
}
