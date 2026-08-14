// notify-upcoming-events
// Called by pg_cron every 5 minutes.
// Sends push-first reminders at ~30m and ~5m before event start.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'

type SmsConfig = {
  quiet_hours_enabled?: boolean
  quiet_hours_start?: string
  quiet_hours_end?: string
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

function formatEasternTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const correlationId = getCorrelationId(req, 'notify')
  try {
    const supabaseUrl = requireEnv('SUPABASE_URL')
    const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY')
    const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const now = new Date()
    const lookAheadEnd = new Date(now.getTime() + 36 * 60 * 1000)

    const { data: smsSetting } = await supabase.from('settings').select('value').eq('key', 'sms_config').single()
    const cfg = (smsSetting?.value ?? {}) as SmsConfig
    const quiet = isQuietHours(now, cfg)
    const applyQuietToPush = cfg.push_quiet_hours_enabled ?? true

    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, title, start_time, end_time, event_type, all_day, location_name, status,
        members:event_members(family_member:family_members(name))
      `)
      .is('deleted_at', null)
      .gte('start_time', now.toISOString())
      .lte('start_time', lookAheadEnd.toISOString())
      .or('status.is.null,status.neq.cancelled')

    if (error) throw error
    let fired = 0

    if (events && events.length > 0) {
      // 1. Cluster identical duplicate events by normalized title + start time
      type EventRow = typeof events[0]
      const clusters = new Map<string, EventRow[]>()

      for (const event of events) {
        const eventStart = new Date(event.start_time)
        const minsToStart = Math.round((eventStart.getTime() - now.getTime()) / 60000)
        const bucket = minsToStart >= 25 && minsToStart <= 35
          ? 30
          : minsToStart >= 3 && minsToStart <= 7
          ? 5
          : null

        if (!bucket) continue
        if (applyQuietToPush && quiet) continue

        const normTitle = (event.title || 'event')
          .toLowerCase()
          .replace(/^[^a-z0-9]+/i, '')
          .replace(/\s+/g, ' ')
          .trim()
        const timeKey = `${eventStart.getUTCFullYear()}-${String(eventStart.getUTCMonth() + 1).padStart(2, '0')}-${String(eventStart.getUTCDate()).padStart(2, '0')}T${String(eventStart.getUTCHours()).padStart(2, '0')}:${String(eventStart.getUTCMinutes()).padStart(2, '0')}`
        const clusterKey = `${event.event_type || 'event'}:${normTitle}:${timeKey}:${bucket}`

        const list = clusters.get(clusterKey) ?? []
        list.push(event)
        clusters.set(clusterKey, list)
      }

      // 2. Dispatch exactly one notification per semantic event cluster
      for (const [clusterKey, eventList] of clusters.entries()) {
        const primaryEvent = eventList[0]
        const eventStart = new Date(primaryEvent.start_time)
        const minsToStart = Math.round((eventStart.getTime() - now.getTime()) / 60000)
        const bucket = minsToStart >= 25 && minsToStart <= 35 ? 30 : 5
        const isReminder = primaryEvent.event_type === 'reminder'
        const notifType = isReminder
          ? bucket === 30 ? 'push_reminder_30' : 'push_reminder_5'
          : bucket === 30 ? 'push_event_30' : 'push_event_5'

        const clusterDedupeKey = `push_${isReminder ? 'reminder' : 'event'}_${bucket}:${clusterKey}`
        const eventIds = eventList.map(e => e.id)

        // Check if already notified by dedupe key or any event ID in the cluster
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .or(`dedupe_key.eq.${clusterDedupeKey},and(type.eq.${notifType},event_id.in.(${eventIds.join(',')}))`)
          .limit(1)

        if ((existing?.length ?? 0) > 0) continue

        // Combine member names across all duplicate copies in cluster
        const allMembers = eventList.flatMap(e => Array.isArray(e.members) ? e.members : [])
        const peopleNames = Array.from(new Set(
          allMembers
            .map((m: { family_member: { name: string } }) => m.family_member?.name)
            .filter(Boolean)
        )).join(', ')

        const startStr = formatEasternTime(eventStart)
        const title = primaryEvent.title
        let body = `${startStr}`
        if (peopleNames) body += ` · ${peopleNames}`
        if (primaryEvent.location_name) body += `\n📍 ${primaryEvent.location_name}`

        const pushTag = `event-${bucket}-${encodeURIComponent(clusterKey).slice(0, 60)}`

        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'x-correlation-id': correlationId,
          },
          body: JSON.stringify({
            title: isReminder
              ? (bucket === 30 ? `🔔 Reminder in ~30 min` : `🔔 Reminder in ~5 min`)
              : (bucket === 30 ? `⏰ ${title} in ~30 min` : `⏳ ${title} in ~5 min`),
            body,
            url: '/',
            tag: pushTag,
            data: { eventId: primaryEvent.id, eventType: primaryEvent.event_type, url: '/' },
            actions: [
              { action: 'done', title: isReminder ? 'Complete' : 'Mark Done' },
              { action: 'thumbs_down', title: 'Thumbs down' },
            ],
          }),
        })

        const pushJson = await pushRes.json().catch(() => null) as { sent?: number } | null
        const sent = Number(pushJson?.sent ?? 0)
        if (sent <= 0) continue

        await supabase.from('notifications').insert({
          type: notifType,
          title: isReminder
            ? (bucket === 30 ? `Reminder soon: ${title}` : `Reminder now: ${title}`)
            : (bucket === 30 ? `Upcoming: ${title}` : `Starting soon: ${title}`),
          body,
          event_id: primaryEvent.id,
          source: 'system',
          dedupe_key: clusterDedupeKey,
        })

        fired++
      }
    }

    const policyRes = await fetch(`${supabaseUrl}/functions/v1/apply-notification-policy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify({}),
    }).catch(() => null)
    const policy = policyRes?.ok ? await policyRes.json().catch(() => null) : null

    return json({ ok: true, correlation_id: correlationId, fired, quiet_hours_active: quiet, policy }, 200, correlationId)
  } catch (err) {
    console.error(`[notify-upcoming-events][${correlationId}]`, err)
    return json({ ok: false, correlation_id: correlationId, error: getErrorMessage(err) }, 500, correlationId)
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-correlation-id',
}

function json(data: unknown, status = 200, correlationId?: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCorrelationHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }, correlationId ?? `notify-${crypto.randomUUID()}`),
  })
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}
