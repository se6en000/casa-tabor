// send-push-notification
// Sends a web push to all subscribed devices
// Body: { title, body, url?, tag? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@casa-tabor.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { title, body, url = '/', tag, actions, data = {}, eventId } = await req.json()
    const payloadData = {
      ...(typeof data === 'object' && data !== null ? data : {}),
      eventId: (typeof data === 'object' && data !== null && 'eventId' in data)
        ? (data as Record<string, unknown>).eventId
        : eventId,
    }
    const payload = JSON.stringify({ title, body, url, tag, actions, data: payloadData, eventId: payloadData.eventId })

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')

    if (error) throw error
    if (!subs || subs.length === 0) {
      return json({ ok: true, sent: 0, failed: 0, message: 'no subscribers' })
    }

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          { TTL: 86400 }
        )
      )
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.length - sent

    const errors = results
      .map((r, i) => {
        if (r.status !== 'rejected') return null
        const reason = (r as PromiseRejectedResult).reason as { statusCode?: number; body?: string; message?: string }
        return {
          endpoint: subs[i].endpoint,
          status: reason?.statusCode ?? 0,
          message: reason?.body ?? reason?.message ?? String(reason),
        }
      })
      .filter((e): e is { endpoint: string; status: number; message: string } => Boolean(e))

    const staleEndpoints = errors
      .filter((e) => e.status === 404 || e.status === 410)
      .map((e) => e.endpoint)

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    const errorSummary = errors.reduce<Record<string, number>>((acc, e) => {
      const key = String(e.status || 'unknown')
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})

    return json({ ok: true, sent, failed, error_summary: errorSummary, sample_errors: errors.slice(0, 5) })
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500)
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
