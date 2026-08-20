import { createClient } from 'npm:@supabase/supabase-js@2'
import { getCorrelationId, invocationHeaders, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
}

type SmsConfig = {
  enabled?: boolean
  twilio_account_sid?: string
  twilio_auth_token?: string
  twilio_from_number?: string
  conflict_alerts?: boolean
  prep_alerts?: boolean
  notify_members?: string[]
  quiet_hours_enabled?: boolean
  quiet_hours_start?: string // HH:mm
  quiet_hours_end?: string // HH:mm
  escalation_enabled?: boolean
  escalation_minutes?: number
  sms_escalation_only?: boolean
  push_quiet_hours_enabled?: boolean
}

function toMinutes(hhmm: string | undefined, fallback: number): number {
  if (!hhmm || !hhmm.includes(':')) return fallback
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return h * 60 + m
}

function isQuietHours(now: Date, cfg: SmsConfig): boolean {
  if (!cfg.quiet_hours_enabled) return false
  const minutes = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now).replace(':', ''),
  )
  const nowMins = Math.floor(minutes / 100) * 60 + (minutes % 100)
  const start = toMinutes(cfg.quiet_hours_start, 22 * 60)
  const end = toMinutes(cfg.quiet_hours_end, 7 * 60)
  if (start === end) return false
  if (start < end) return nowMins >= start && nowMins < end
  return nowMins >= start || nowMins < end
}

// Lead-time urgency curve for prep-item escalation. Returns a bucket name
// (fires at most once per item, ever — see dedupe_key usage below) or null
// if this item shouldn't notify yet. Replaces the old "priority>=3 notifies
// every ~6h forever regardless of how far away it is" behavior, which is
// what made a reminder due in 12 days look exactly as urgent as one due in
// 20 minutes.
function prepEscalationBucket(
  dueInMins: number,
  priority: number,
  cfg: SmsConfig,
  escalateMinutes: number,
): string | null {
  // Overdue prep items used to be excluded from this query entirely (silently never
  // escalated). Now they're included and get a one-shot "past_due" notification --
  // the most urgent bucket, fires once, then dedupe_key prevents re-firing forever.
  if (dueInMins < 0) return 'past_due'
  const DAY = 24 * 60
  if (priority >= 3) {
    if (dueInMins <= escalateMinutes) return 'due_now'
    if (dueInMins <= DAY) return 'day_of'
    if (dueInMins <= 2 * DAY) return '48h'
    return 'initial' // first time we saw this — one quiet heads-up, then wait for a real threshold
  }
  if (!cfg.escalation_enabled) return null
  if (dueInMins <= escalateMinutes) return 'due_soon'
  return null
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const correlationId = getCorrelationId(req, 'policy')
  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const now = new Date()
    const nowIso = now.toISOString()

  const { data: smsSetting } = await sb.from('settings').select('value').eq('key', 'sms_config').single()
  const cfg = (smsSetting?.value ?? {}) as SmsConfig
  const notifyMembers = cfg.notify_members ?? []
  const quiet = isQuietHours(now, cfg)
  const escalateMinutes = Number.isFinite(cfg.escalation_minutes) ? Number(cfg.escalation_minutes) : 90
  const smsEscalationOnly = cfg.sms_escalation_only ?? true
  const applyQuietToPush = cfg.push_quiet_hours_enabled ?? true

  const [conflictsRes, prepRes, membersRes] = await Promise.all([
    sb.rpc('get_active_conflict_alerts'),
    sb.from('prep_items')
      .select('id, event_id, event_title, description, due_by, priority')
      .eq('dismissed', false)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
      .order('priority', { ascending: false })
      .order('due_by', { ascending: true })
      .limit(50),
    notifyMembers.length > 0
      ? sb.from('family_members').select('id, name, phone').in('id', notifyMembers)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[], error: null }),
  ])

  const members = membersRes.data ?? []
  const conflicts = (conflictsRes.data ?? []) as {
    id: string
    severity: number
    description: string
    event_a_id: string | null
    event_a_title: string | null
    event_a_start_time: string | null
  }[]
  const prepItems = (prepRes.data ?? []) as {
    id: string
    event_id: string | null
    event_title: string | null
    description: string
    due_by: string | null
    priority: number
  }[]

  let createdNotifications = 0
  let sentPush = 0
  let sentSms = 0

  async function maybeSendPush(
    title: string,
    body: string,
    tag: string,
    url = '/',
    eventId?: string | null,
  ) {
    if (quiet && applyQuietToPush) return
    const { error } = await sb.functions.invoke('send-push-notification', {
      body: {
        title,
        body,
        tag,
        url,
        data: { url, eventId: eventId ?? null },
        actions: [
          { action: 'done', title: 'Done' },
          { action: 'thumbs_down', title: 'Thumbs down' },
        ],
      },
      headers: invocationHeaders(correlationId),
    })
    if (!error) sentPush++
  }

  async function maybeSendSms(message: string, severity: number) {
    if (!cfg.enabled || !cfg.twilio_account_sid || !cfg.twilio_auth_token || !cfg.twilio_from_number) return
    if (quiet && severity < 3) return
    for (const m of members) {
      if (!m.phone) continue
      const { error } = await sb.functions.invoke('send-sms', {
        body: { to: m.phone, body: message.slice(0, 1590), member_id: m.id },
        headers: invocationHeaders(correlationId),
      })
      if (!error) sentSms++
    }
  }

  // Conflicts: notify immediately; SMS based on policy.
  for (const c of conflicts) {
    const eventTitle = c.event_a_title ?? 'Upcoming event'
    const dedupeKey = `policy_conflict:${c.id}`
    const { data: existing } = await sb.from('notifications')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .limit(1)
    if ((existing?.length ?? 0) > 0) continue

    await sb.from('notifications').insert({
      type: 'policy_conflict',
      title: `Conflict: ${eventTitle}`,
      body: c.description,
      event_id: c.event_a_id,
      source: 'policy',
      dedupe_key: dedupeKey,
    })
    createdNotifications++
    await maybeSendPush(`⚠️ Conflict: ${eventTitle}`, c.description, `policy-conflict-${c.id}`, '/', c.event_a_id)
    if (cfg.conflict_alerts && (!smsEscalationOnly || c.severity >= 3)) {
      await maybeSendSms(`Casa alert: ${c.description}`, c.severity)
    }
  }

  // Prep: escalate on a lead-time curve instead of "priority>=3 notifies every
  // cycle forever". Each bucket fires at most once per prep item (tracked via
  // dedupe_key), so an item due in 12 days surfaces once early, then goes
  // quiet until it crosses a meaningful threshold — not every ~6h regardless
  // of distance to its due date.
  for (const p of prepItems) {
    if (!p.due_by) continue
    const dueMs = new Date(p.due_by).getTime() - now.getTime()
    const dueInMins = Math.floor(dueMs / 60000)
    const bucket = prepEscalationBucket(dueInMins, p.priority, cfg, escalateMinutes)
    if (!bucket) continue

    const dedupeKey = `policy_prep:${p.id}:${bucket}`
    const { data: existing } = await sb.from('notifications')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .limit(1)
    if ((existing?.length ?? 0) > 0) continue

    const title = p.event_title ?? 'Upcoming task'
    await sb.from('notifications').insert({
      type: 'policy_prep',
      title: `Prep due: ${title}`,
      body: p.description,
      event_id: p.event_id,
      source: 'policy',
      dedupe_key: dedupeKey,
    })
    createdNotifications++
    if (cfg.prep_alerts) await maybeSendSms(`Casa prep: ${p.description}`, p.priority >= 3 ? 3 : 2)
  }

    return new Response(
      JSON.stringify({
        ok: true,
        correlation_id: correlationId,
        quiet_hours_active: quiet,
        created_notifications: createdNotifications,
        push_sent: sentPush,
        sms_sent: sentSms,
      }),
      { headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, correlation_id: correlationId, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: withCorrelationHeaders({ ...CORS, 'content-type': 'application/json' }, correlationId) },
    )
  }
})
