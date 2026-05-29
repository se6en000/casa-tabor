/**
 * send-sms
 * Core Twilio SMS sender. Called by other edge functions or the app directly.
 *
 * Body: { to: string, body: string, member_id?: string }
 * Reads Twilio credentials from settings.sms_config
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { to, body, member_id } = await req.json() as { to: string; body: string; member_id?: string }

  // Load Twilio config
  const { data: setting } = await sb.from('settings').select('value').eq('key', 'sms_config').single()
  const cfg = setting?.value as {
    enabled: boolean
    twilio_account_sid: string
    twilio_auth_token: string
    twilio_from_number: string
  } | null

  if (!cfg?.enabled || !cfg.twilio_account_sid || !cfg.twilio_auth_token || !cfg.twilio_from_number) {
    return new Response(JSON.stringify({ error: 'SMS not configured or disabled' }), {
      status: 400, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // Send via Twilio REST API
  const params = new URLSearchParams({ To: to, From: cfg.twilio_from_number, Body: body })
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilio_account_sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${cfg.twilio_account_sid}:${cfg.twilio_auth_token}`)}`,
      },
      body: params.toString(),
    },
  )

  const twilioData = await twilioRes.json()

  // Log it
  await sb.from('sms_log').insert({
    direction: 'outbound',
    to_number: to,
    from_number: cfg.twilio_from_number,
    body,
    status: twilioRes.ok ? 'sent' : 'failed',
    twilio_sid: twilioData.sid ?? null,
    member_id: member_id ?? null,
    error: twilioRes.ok ? null : JSON.stringify(twilioData),
  })

  if (!twilioRes.ok) {
    return new Response(JSON.stringify({ error: twilioData }), {
      status: 502, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, sid: twilioData.sid }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
