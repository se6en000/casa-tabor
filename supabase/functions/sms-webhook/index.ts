/**
 * sms-webhook
 * Receives inbound SMS replies from Twilio.
 * Identifies the sender, passes their message + today's events to the AI,
 * applies any action (reassign, reschedule, add event, etc.),
 * and replies with a TwiML confirmation.
 *
 * Twilio webhook URL: https://<project>.supabase.co/functions/v1/sms-webhook
 * Set this in Twilio Console → Phone Numbers → Active Numbers → Messaging → Webhook
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST
  const body = await req.text()
  const params = new URLSearchParams(body)
  const from   = params.get('From') ?? ''
  const msgBody = params.get('Body')?.trim() ?? ''

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Load LLM config
  const { data: llmSetting } = await sb.from('settings').select('value').eq('key', 'llm_config').single()
  const llmConfig = llmSetting?.value as { provider: string; model: string; api_key: string } | null

  // Identify sender by phone number
  // Normalize: strip spaces/dashes, ensure E.164
  const normalizedFrom = from.replace(/\s|-/g, '')
  const { data: member } = await sb
    .from('family_members')
    .select('id, name, phone')
    .eq('phone', normalizedFrom)
    .maybeSingle()

  // Log inbound message
  await sb.from('sms_log').insert({
    direction: 'inbound',
    from_number: from,
    body: msgBody,
    status: 'received',
    member_id: member?.id ?? null,
  })

  // Unknown number — politely decline
  if (!member) {
    return twiml("Sorry, I don't recognize this number. Add it to Casa Tabor in Family Settings.")
  }

  // Load today + next 7 days of events for context
  const now = new Date()
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data: events } = await sb
    .from('events')
    .select('id, title, start_time, end_time, all_day, location_name, event_members(family_member_id, family_members(name))')
    .gte('start_time', now.toISOString().slice(0, 10) + 'T00:00:00Z')
    .lte('start_time', weekOut.toISOString())
    .eq('status', 'confirmed')
    .order('start_time')

  const { data: allMembers } = await sb.from('family_members').select('id, name').order('sort_order')

  if (!llmConfig?.api_key) {
    // No LLM — echo back a simple acknowledgement
    return twiml(`Hi ${member.name}! AI isn't configured yet. Set up an LLM in Casa Tabor Settings.`)
  }

  // Build the AI prompt
  const eventList = (events ?? []).map((ev: {
    id: string; title: string; start_time: string; end_time: string; all_day: boolean;
    location_name?: string; event_members: { family_member_id: string; family_members: { name: string } }[]
  }) => {
    const time = ev.all_day
      ? 'All day'
      : new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    const date = new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    const who = ev.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ')
    return `ID:${ev.id} | ${date} ${time} | ${ev.title}${ev.location_name ? ` @ ${ev.location_name}` : ''}${who ? ` (${who})` : ''}`
  }).join('\n')

  const memberList = (allMembers ?? []).map(m => `${m.name} (id:${m.id})`).join(', ')

  const systemPrompt = `You are the Casa Tabor SMS assistant. The user is ${member.name}.
Current date/time: ${now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}

UPCOMING EVENTS (next 7 days):
${eventList || 'None'}

FAMILY MEMBERS: ${memberList}

The user texted you: "${msgBody}"

Understand their intent and respond with a JSON object (no markdown, just raw JSON):
{
  "action": "none" | "reschedule" | "reassign" | "add" | "delete" | "query",
  "reply": "Friendly SMS reply (max 160 chars, confirm what you did or answer their question)",
  "event_id": "uuid of event to change (for reschedule/reassign/delete)",
  "new_start": "ISO 8601 datetime (for reschedule)",
  "new_end": "ISO 8601 datetime (for reschedule, same duration if not specified)",
  "new_member_ids": ["uuid", ...] (for reassign — replace all attendees),
  "new_event": {
    "title": "...",
    "start": "ISO 8601",
    "end": "ISO 8601",
    "location": "optional"
  }
}

Rules:
- For queries just say action: "query" and put the answer in reply.
- Keep the reply friendly and under 160 characters.
- If the intent is unclear, ask for clarification in reply with action: "none".
- Times should be in America/New_York timezone. Convert natural language ("3pm", "tomorrow morning") to ISO 8601.
- If the user says "me" or "I", they mean member id: ${member.id} (${member.name}).`

  let aiResponse: {
    action: string
    reply: string
    event_id?: string
    new_start?: string
    new_end?: string
    new_member_ids?: string[]
    new_event?: { title: string; start: string; end: string; location?: string }
  } | null = null

  try {
    const rawText = await callLLM(llmConfig, systemPrompt)
    // Strip any accidental markdown code fences
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    aiResponse = JSON.parse(cleaned)
  } catch (e) {
    console.error('[sms-webhook] AI parse error:', e)
    return twiml(`Hi ${member.name}! I had trouble understanding that. Could you rephrase?`)
  }

  if (!aiResponse) return twiml(`Hi ${member.name}! Something went wrong. Please try again.`)

  // Apply the action
  try {
    if (aiResponse.action === 'reschedule' && aiResponse.event_id && aiResponse.new_start) {
      const { error } = await sb.from('events').update({
        start_time: aiResponse.new_start,
        end_time: aiResponse.new_end ?? aiResponse.new_start,
        updated_at: new Date().toISOString(),
      }).eq('id', aiResponse.event_id)

      if (!error) {
        // Push to Google Calendar
        sb.functions.invoke('push-to-google', { body: { event_id: aiResponse.event_id } }).catch(() => {})
      }
    }

    if (aiResponse.action === 'reassign' && aiResponse.event_id && aiResponse.new_member_ids?.length) {
      // Replace all event_members
      await sb.from('event_members').delete().eq('event_id', aiResponse.event_id)
      await sb.from('event_members').insert(
        aiResponse.new_member_ids.map((id, i) => ({
          event_id: aiResponse!.event_id,
          family_member_id: id,
          role: i === 0 ? 'primary' : 'attendee',
        }))
      )
      sb.functions.invoke('push-to-google', { body: { event_id: aiResponse.event_id } }).catch(() => {})
    }

    if (aiResponse.action === 'add' && aiResponse.new_event) {
      const { data: newEvent } = await sb.from('events').insert({
        title: aiResponse.new_event.title,
        start_time: aiResponse.new_event.start,
        end_time: aiResponse.new_event.end,
        location_name: aiResponse.new_event.location ?? null,
        all_day: false,
        status: 'confirmed',
        is_enriched: false,
      }).select().single()

      if (newEvent) {
        // Assign to the sender by default
        await sb.from('event_members').insert({ event_id: newEvent.id, family_member_id: member.id, role: 'primary' })
        sb.functions.invoke('create-google-event', { body: { event_id: newEvent.id } }).catch(() => {})
        sb.functions.invoke('enrich-event', { body: { event_id: newEvent.id } }).catch(() => {})
      }
    }

    if (aiResponse.action === 'delete' && aiResponse.event_id) {
      await sb.functions.invoke('delete-google-event', { body: { event_id: aiResponse.event_id } }).catch(() => {})
      await sb.from('events').update({ status: 'cancelled' }).eq('id', aiResponse.event_id)
    }
  } catch (e) {
    console.error('[sms-webhook] action error:', e)
    return twiml(`Hi ${member.name}! I understood you but couldn't apply the change. Try again or open the app.`)
  }

  // Log outbound reply
  await sb.from('sms_log').insert({
    direction: 'outbound',
    to_number: from,
    body: aiResponse.reply,
    status: 'sent',
    member_id: member.id,
  })

  return twiml(aiResponse.reply)
})

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function callLLM(
  config: { provider: string; model: string; api_key: string },
  prompt: string,
): Promise<string> {
  if (config.provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    )
    const data = await res.json()
    const parts = (data.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]
    return parts.filter(p => !p.thought).map(p => p.text ?? '').join('').trim()
  }

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: 512, temperature: 0.3 }),
    })
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    return data.content?.[0]?.text?.trim() ?? ''
  }

  throw new Error(`Unknown LLM provider: ${config.provider}`)
}
