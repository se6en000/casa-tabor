// notify-upcoming-events
// Called by pg_cron every 5 minutes.
// Finds events starting in ~25-35 min (or tomorrow morning for all-day)
// and fires push notifications for each unnotified event.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format } from 'https://esm.sh/date-fns@3'
import { getCorrelationId, withCorrelationHeaders } from '../_shared/correlation.ts'
import { requireEnv } from '../_shared/env.ts'

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
    // Window: 25 to 35 minutes from now
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000)

    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, title, start_time, end_time, event_type, all_day, location_name,
        members:event_members(family_member:family_members(name))
      `)
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString())
      .neq('event_type', 'reminder')
      .is('notified_at', null)

    if (error) throw error
    let fired = 0
    if (events && events.length > 0) {
      for (const event of events) {
        const members = Array.isArray(event.members) ? event.members : []
        const peopleNames = members
          .map((m: { family_member: { name: string } }) => m.family_member?.name)
          .filter(Boolean)
          .join(', ')

        const startStr = format(new Date(event.start_time), 'h:mm a')
        const title = stripPersonPrefix(event.title)

        let body = `${startStr}`
        if (peopleNames) body += ` · ${peopleNames}`
        if (event.location_name) body += `\n📍 ${event.location_name}`

        // Fire notification
        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'x-correlation-id': correlationId,
          },
          body: JSON.stringify({
            title: `⏰ ${title} in ~30 min`,
            body,
            url: '/',
            tag: `event-${event.id}`,
          }),
        })

        // Mark notified so it doesn't fire again
        await supabase
          .from('events')
          .update({ notified_at: now.toISOString() })
          .eq('id', event.id)

        fired++
      }
    }

    // Always run policy layer each cycle (conflicts/prep routing + quiet-hours + escalation).
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

    return json({ ok: true, correlation_id: correlationId, fired, policy }, 200, correlationId)
  } catch (err) {
    console.error(`[notify-upcoming-events][${correlationId}]`, err)
    return json({ ok: false, correlation_id: correlationId, error: getErrorMessage(err) }, 500, correlationId)
  }
})

function stripPersonPrefix(title: string): string {
  const parts = title.split(' | ')
  return parts.length > 1 ? parts.slice(1).join(' | ') : title
}

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
