// notify-upcoming-events
// Called by pg_cron every 5 minutes.
// Finds events starting in ~25-35 min (or tomorrow morning for all-day)
// and fires push notifications for each unnotified event.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format } from 'https://esm.sh/date-fns@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const now = new Date()
    // Window: 25 to 35 minutes from now
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000)

    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, title, start_time, end_time, event_type, all_day,
        enrichment:event_enrichments(location_name, address),
        members:event_members(family_member:family_members(name))
      `)
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString())
      .neq('event_type', 'reminder')
      .is('notified_at', null)

    if (error) throw error
    if (!events || events.length === 0) {
      return json({ ok: true, fired: 0 })
    }

    let fired = 0
    for (const event of events) {
      const enr = Array.isArray(event.enrichment) ? event.enrichment[0] : event.enrichment
      const members = Array.isArray(event.members) ? event.members : []
      const peopleNames = members
        .map((m: { family_member: { name: string } }) => m.family_member?.name)
        .filter(Boolean)
        .join(', ')

      const startStr = format(new Date(event.start_time), 'h:mm a')
      const title = stripPersonPrefix(event.title)

      let body = `${startStr}`
      if (peopleNames) body += ` · ${peopleNames}`
      if (enr?.location_name) body += `\n📍 ${enr.location_name}`

      // Fire notification
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

    return json({ ok: true, fired })
  } catch (err) {
    console.error('[notify-upcoming-events]', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

function stripPersonPrefix(title: string): string {
  const parts = title.split(' | ')
  return parts.length > 1 ? parts.slice(1).join(' | ') : title
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
