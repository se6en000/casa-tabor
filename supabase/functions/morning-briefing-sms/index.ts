/**
 * morning-briefing-sms
 * Generates (or reuses) today's briefing and sends it via SMS to all configured family members.
 * Designed to be called by a Supabase scheduled cron job at the configured briefing_time.
 *
 * Can also be triggered manually: POST with an empty body.
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

  // Load SMS config
  const { data: smsSetting } = await sb.from('settings').select('value').eq('key', 'sms_config').single()
  const cfg = smsSetting?.value as {
    enabled: boolean
    briefing_enabled: boolean
    twilio_account_sid: string
    twilio_auth_token: string
    twilio_from_number: string
    notify_members: string[]  // family_member ids
  } | null

  if (!cfg?.enabled || !cfg.briefing_enabled) {
    return new Response(JSON.stringify({ skipped: 'SMS briefing disabled' }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  if (!cfg.twilio_account_sid || !cfg.twilio_auth_token || !cfg.twilio_from_number) {
    return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
      status: 400, headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  if (!cfg.notify_members?.length) {
    return new Response(JSON.stringify({ skipped: 'No members configured to notify' }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Try to get existing briefing for today, otherwise generate one
  let briefingText = ''
  const { data: existing } = await sb
    .from('daily_briefings')
    .select('summary_text')
    .eq('briefing_date', today)
    .single()

  if (existing?.summary_text) {
    briefingText = existing.summary_text
  } else {
    // Generate fresh briefing
    const { data: generated } = await sb.functions.invoke('generate-briefing', {})
    briefingText = generated?.briefing?.summary_text ?? ''
  }

  if (!briefingText) {
    // Fall back to a plain schedule summary if LLM isn't configured
    briefingText = await buildFallbackBriefing(sb, today)
  }

  // Load phone numbers for configured members
  const { data: members } = await sb
    .from('family_members')
    .select('id, name, phone')
    .in('id', cfg.notify_members)

  const results: { member: string; status: string }[] = []

  for (const member of members ?? []) {
    if (!member.phone) {
      results.push({ member: member.name, status: 'skipped — no phone' })
      continue
    }

    const message = `🏠 Good morning, ${member.name}!\n\n${briefingText}\n\nReply with commands like:\n• "Move [event] to 3pm"\n• "Add [event] at [time]"\n• "Who has [event]?"`

    // Truncate to 1600 chars (Twilio max for concatenated SMS)
    const truncated = message.length > 1590
      ? message.slice(0, 1587) + '…'
      : message

    const params = new URLSearchParams({ To: member.phone, From: cfg.twilio_from_number, Body: truncated })
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

    await sb.from('sms_log').insert({
      direction: 'outbound',
      to_number: member.phone,
      from_number: cfg.twilio_from_number,
      body: truncated,
      status: twilioRes.ok ? 'sent' : 'failed',
      twilio_sid: twilioData.sid ?? null,
      member_id: member.id,
      error: twilioRes.ok ? null : JSON.stringify(twilioData),
    })

    results.push({ member: member.name, status: twilioRes.ok ? 'sent' : `failed: ${twilioData.message}` })
  }

  return new Response(JSON.stringify({ ok: true, date: today, results }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

async function buildFallbackBriefing(sb: ReturnType<typeof createClient>, today: string): Promise<string> {
  const { data: events } = await sb
    .from('events')
    .select('title, start_time, end_time, all_day, location_name, event_members(family_members(name))')
    .gte('start_time', today + 'T00:00:00Z')
    .lte('start_time', today + 'T23:59:59Z')
    .eq('status', 'confirmed')
    .order('start_time')

  if (!events?.length) return "No events scheduled for today. Enjoy the free day!"

  const lines = events.map((ev: {
    title: string; start_time: string; all_day: boolean; location_name?: string;
    event_members: { family_members: { name: string } }[]
  }) => {
    const time = ev.all_day
      ? 'All day'
      : new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    const who = ev.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ')
    const where = ev.location_name ? ` @ ${ev.location_name}` : ''
    return `• ${time}: ${ev.title}${where}${who ? ` (${who})` : ''}`
  })

  return `Today's schedule:\n${lines.join('\n')}`
}
