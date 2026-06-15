import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { action, event_id } = await req.json() as { action?: string; event_id?: string }
    if (!action || !event_id) return json({ ok: false, error: 'Missing action or event_id' }, 400)

    const { data: eventRow } = await sb
      .from('events')
      .select('id, title, event_type')
      .eq('id', event_id)
      .single()

    if (action === 'done' || action === 'complete') {
      if (eventRow?.event_type === 'reminder') {
        await sb.from('events').update({ status: 'cancelled' }).eq('id', event_id)
      } else {
        await sb.from('events').update({ notified_at: new Date().toISOString() }).eq('id', event_id)
      }
      await sb.from('notifications').insert({
        type: 'push_action_done',
        title: eventRow?.event_type === 'reminder' ? 'Reminder completed' : 'Marked done',
        body: 'Notification acknowledged from push action.',
        event_id,
        source: 'system',
      })
      return json({ ok: true, action: 'done' })
    }

    if (action === 'snooze') {
      const now = new Date()
      const start = new Date(now.getTime() + 10 * 60 * 1000)
      const end = new Date(now.getTime() + 15 * 60 * 1000)
      const title = eventRow?.title ? `Reminder: ${eventRow.title}` : 'Reminder'

      const { error: insertErr } = await sb.from('events').insert({
        title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        event_type: 'reminder',
      })

      if (insertErr) return json({ ok: false, error: insertErr.message }, 500)

      await sb.from('notifications').insert({
        type: 'push_action_snooze',
        title: 'Snoozed 10 minutes',
        body: title,
        event_id,
        source: 'system',
      })
      return json({ ok: true, action: 'snooze' })
    }

    return json({ ok: false, error: 'Unsupported action' }, 400)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
