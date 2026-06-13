import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ActionItem = {
  type: 'conflict' | 'prep' | 'departure' | 'weather'
  priority: 1 | 2 | 3
  title: string
  description: string
  due_at: string
  event_id: string | null
}

function parseRainChance(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.match(/(\d+)\%\s*rain chance/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))

  const now = new Date()
  const nowIso = now.toISOString()
  const start = body.range_start ? new Date(body.range_start) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = body.range_end ? new Date(body.range_end) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000)

  const [conflictRun, prepRun, weatherRun] = await Promise.all([
    sb.functions.invoke('analyze-conflicts', {
      body: { range_start: start.toISOString(), range_end: end.toISOString() },
    }),
    sb.functions.invoke('analyze-prep', { body: {} }),
    sb.functions.invoke('weather-pending', { body: {} }),
  ])

  const { data: conflictsRaw } = await sb
    .from('conflicts')
    .select('id, conflict_type, severity, description, event_a_id, event_a:events!event_a_id(title, start_time)')
    .eq('resolved', false)
    .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
    .order('severity', { ascending: false })
    .limit(20)

  const { data: prepRaw } = await sb
    .from('prep_items')
    .select('id, event_id, type, emoji, description, event_title, event_date, due_by, priority')
    .eq('dismissed', false)
    .gte('due_by', nowIso)
    .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
    .order('priority', { ascending: false })
    .order('event_date', { ascending: true })
    .limit(20)

  const horizon48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const { data: eventsRaw } = await sb
    .from('events')
    .select('id, title, start_time, event_enrichments(departure_time, weather_at_event)')
    .gte('start_time', nowIso)
    .lte('start_time', horizon48h)
    .eq('status', 'confirmed')
    .order('start_time')

  const actions: ActionItem[] = []

  type ConflictRow = {
    id: string
    severity: number
    description: string
    event_a_id: string | null
    event_a: { title: string; start_time: string } | null
  }

  for (const c of (conflictsRaw ?? []) as ConflictRow[]) {
    const priority = c.severity >= 3 ? 3 : 2
    actions.push({
      type: 'conflict',
      priority,
      title: c.event_a?.title ? `Resolve conflict: ${c.event_a.title}` : 'Resolve scheduling conflict',
      description: c.description,
      due_at: c.event_a?.start_time ?? nowIso,
      event_id: c.event_a_id,
    })
  }

  type PrepRow = {
    event_id: string
    description: string
    event_title: string
    due_by: string
    priority: number
  }

  for (const p of (prepRaw ?? []) as PrepRow[]) {
    const normalizedPriority: 1 | 2 | 3 = p.priority >= 3 ? 3 : p.priority <= 1 ? 1 : 2
    actions.push({
      type: 'prep',
      priority: normalizedPriority,
      title: `Prep: ${p.event_title}`,
      description: p.description,
      due_at: p.due_by,
      event_id: p.event_id,
    })
  }

  type EventRow = {
    id: string
    title: string
    start_time: string
    event_enrichments: { departure_time: string | null; weather_at_event: string | null }[] | null
  }

  for (const ev of (eventsRaw ?? []) as EventRow[]) {
    const enr = ev.event_enrichments?.[0]
    if (!enr) continue

    if (enr.departure_time) {
      actions.push({
        type: 'departure',
        priority: 2,
        title: `Leave on time: ${ev.title}`,
        description: `Departure target is ${new Date(enr.departure_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}.`,
        due_at: enr.departure_time,
        event_id: ev.id,
      })
    }

    const rainChance = parseRainChance(enr.weather_at_event)
    if (rainChance !== null && rainChance >= 50) {
      actions.push({
        type: 'weather',
        priority: rainChance >= 70 ? 3 : 2,
        title: `Weather risk: ${ev.title}`,
        description: enr.weather_at_event ?? 'Rain risk expected. Plan backup logistics.',
        due_at: ev.start_time,
        event_id: ev.id,
      })
    }
  }

  const deduped = new Map<string, ActionItem>()
  for (const item of actions) {
    const key = `${item.type}::${item.event_id ?? 'none'}::${item.title}`
    if (!deduped.has(key)) deduped.set(key, item)
  }

  const actionQueue = [...deduped.values()]
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
    })
    .slice(0, 12)

  const runs = {
    analyze_conflicts: { ok: !conflictRun.error, error: conflictRun.error?.message ?? null },
    analyze_prep: { ok: !prepRun.error, error: prepRun.error?.message ?? null },
    weather_pending: { ok: !weatherRun.error, error: weatherRun.error?.message ?? null },
  }

  return new Response(
    JSON.stringify({
      ok: true,
      runs,
      counts: {
        conflicts: (conflictsRaw ?? []).length,
        prep_items: (prepRaw ?? []).length,
        action_queue: actionQueue.length,
      },
      conflicts: conflictsRaw ?? [],
      prep_items: prepRaw ?? [],
      action_queue: actionQueue,
    }),
    { headers: { ...CORS, 'content-type': 'application/json' } },
  )
})
