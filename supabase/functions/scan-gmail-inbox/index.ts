/**
 * scan-gmail-inbox  v2
 *
 * For each family member with gmail_scan_enabled:
 *   1. Fetch new inbox messages (incremental via historyId)
 *   2. Classify intent: new_event | update_event | travel_detail | skip
 *   3. new_event    → fuzzy-dedup against existing events → create or skip
 *   4. update_event → patch existing event; surface conflict notification if times changed significantly
 *   5. travel_detail → hand off to scan-travel-emails pipeline inline
 *   6. Latest-email-wins for trips (compare source_email_received_at)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TRAVEL_SENDER_DOMAINS = [
  'mycwt.com', 'carlsonwagonlit.com', 'concur.com', 'egencia.com',
  'aa.com', 'delta.com', 'united.com', 'southwest.com', 'jetblue.com',
  'spirit.com', 'alaskaair.com', 'hawaiianairlines.com', 'flyfrontier.com',
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'wyndham.com',
  'booking.com', 'expedia.com', 'tripit.com',
]
const TRAVEL_KEYWORDS = /itinerary|e-ticket|eticket|boarding pass|flight confirmation|booking confirmation|reservation confirmed|hotel confirmation|your flight|trip receipt|travel itinerary|airline confirmation|ticket number|record locator|e-ticket and trip/i

// Keywords that suggest calendar relevance
const CALENDAR_KEYWORDS = /appointment|appt|booking|reservation|confirm|invite|invitation|reminder|rsvp|meeting|schedule|event|registration|playdate|dentist|doctor|physician|clinic|hospital|therapy|checkup|concert|show|performance|game|match|tournament|practice|party|birthday|celebration|dinner|lunch|brunch|flight|hotel|check-in|checkout|school|class|lesson|camp|workshop|conference/i

// ── Gmail helpers ─────────────────────────────────────────────────

async function gmailFetch(path: string, token: string) {
  return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function getRecentMessages(accessToken: string, historyId: string | null): Promise<{ messages: { id: string }[]; newHistoryId: string | null }> {
  if (historyId) {
    const res = await gmailFetch(`/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX&maxResults=50`, accessToken)
    if (res.status === 404) return getRecentMessages(accessToken, null)
    if (!res.ok) return { messages: [], newHistoryId: null }
    const data = await res.json()
    const messages: { id: string }[] = []
    for (const h of (data.history ?? [])) {
      for (const m of (h.messagesAdded ?? [])) {
        if (m.message?.labelIds?.includes('INBOX')) messages.push({ id: m.message.id })
      }
    }
    return { messages, newHistoryId: data.historyId ?? historyId }
  } else {
    const after = Math.floor((Date.now() - 72 * 3600 * 1000) / 1000)
    const res = await gmailFetch(`/users/me/messages?labelIds=INBOX&q=after:${after}&maxResults=50`, accessToken)
    if (!res.ok) return { messages: [], newHistoryId: null }
    const data = await res.json()
    const profileRes = await gmailFetch('/users/me/profile', accessToken)
    const profile = profileRes.ok ? await profileRes.json() : {}
    return { messages: data.messages ?? [], newHistoryId: profile.historyId ?? null }
  }
}

function extractBodyText(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
  let text = ''
  function walk(part: typeof payload) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    }
    for (const sub of (part.parts ?? [])) walk(sub as typeof part)
  }
  walk(payload)
  return text
}

async function getMessageDetails(msgId: string, accessToken: string) {
  const res = await gmailFetch(`/users/me/messages/${msgId}?format=full`, accessToken)
  if (!res.ok) return null
  const msg = await res.json()
  const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
  return {
    subject: headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '',
    from:    headers.find(h => h.name.toLowerCase() === 'from')?.value ?? '',
    date:    headers.find(h => h.name.toLowerCase() === 'date')?.value ?? '',
    snippet: msg.snippet ?? '',
    body:    extractBodyText(msg.payload ?? {}),
  }
}

// ── Token refresh ─────────────────────────────────────────────────

async function refreshToken(rt: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) return null
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

// ── LLM call ──────────────────────────────────────────────────────

async function callLLM(llmConfig: { provider?: string; model?: string; api_key: string }, prompt: string): Promise<string> {
  const model = llmConfig.model ?? 'gemini-2.5-flash'
  const apiKey = llmConfig.api_key
  if (llmConfig.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1, max_tokens: 500 }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}`)
    const data = await res.json()
    return data.choices[0].message.content
  } else {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.1, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
}

// ── Intent classification ─────────────────────────────────────────

interface EmailIntent {
  intent: 'new_event' | 'update_event' | 'travel_detail' | 'skip'
  // new_event / update_event fields
  title?: string
  start_datetime?: string   // ISO8601 or 'unknown'
  end_datetime?: string
  all_day?: boolean
  location?: string
  description?: string
  assigned_member?: string  // family member name
  // update_event fields
  updates_event_title?: string   // title of the event this email is updating
  updates_event_date?: string    // approximate date of event being updated
  change_summary?: string        // human-readable summary of what changed
  // skip field
  skip_reason?: string
}

async function classifyEmail(
  subject: string,
  from: string,
  date: string,
  body: string,
  familyMembers: { id: string; name: string; role: string }[],
  llmConfig: { provider?: string; model?: string; api_key: string },
): Promise<EmailIntent | null> {
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are the inbox classifier for a family calendar app. Today is ${today}.
Family members: ${familyMembers.map(m => `${m.name} (${m.role})`).join(', ')}

Classify this email into ONE intent:
- "new_event": A brand-new appointment, booking, event, meeting, class, etc. with a specific date/time
- "update_event": An update, change, cancellation, or reminder for an EXISTING event (look for "updated", "changed", "rescheduled", "cancelled", "reminder for your upcoming", "your appointment has been moved")
- "travel_detail": Flight confirmation, hotel booking, trip itinerary, e-ticket — travel logistics
- "skip": Purely promotional, newsletter, shipping, no date, or already handled

EMAIL:
Subject: ${subject}
From: ${from}
Date: ${date}
Body: ${body.slice(0, 3000)}

Reply ONLY with JSON:
{
  "intent": "new_event|update_event|travel_detail|skip",
  "title": "short event title (new_event/update_event only)",
  "start_datetime": "ISO8601 with timezone offset or 'unknown'",
  "end_datetime": "ISO8601 with timezone offset or 'unknown'",
  "all_day": false,
  "location": "venue/address or empty",
  "description": "1-2 sentence summary",
  "assigned_member": "family member name most likely attending, or empty",
  "updates_event_title": "title of event being updated (update_event only)",
  "updates_event_date": "YYYY-MM-DD of event being updated (update_event only)",
  "change_summary": "what changed: e.g. 'time moved from 2pm to 3pm' (update_event only)",
  "skip_reason": "why skipping (skip only)"
}`

  try {
    const raw = await callLLM(llmConfig, prompt)
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as EmailIntent
  } catch { return null }
}

// ── Fuzzy event dedup ─────────────────────────────────────────────
// Returns existing event ID if we find a probable match; null if it looks new.

function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2))
  const wa = words(a); const wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.max(wa.size, wb.size)
}

async function findMatchingEvent(
  sb: ReturnType<typeof createClient>,
  memberId: string,
  title: string,
  startDatetime: string,
  location: string,
): Promise<{ id: string; title: string; start_time: string; end_time: string; location_name: string | null } | null> {
  if (!startDatetime || startDatetime === 'unknown') return null
  const d = new Date(startDatetime)
  if (isNaN(d.getTime())) return null

  // Search ±2 days
  const lo = new Date(d); lo.setDate(d.getDate() - 2)
  const hi = new Date(d); hi.setDate(d.getDate() + 2)

  const { data: events } = await sb
    .from('event_members')
    .select('events!inner(id, title, start_time, end_time, location_name)')
    .eq('family_member_id', memberId)
    .gte('events.start_time', lo.toISOString())
    .lte('events.start_time', hi.toISOString())

  if (!events || events.length === 0) return null

  for (const row of events) {
    const ev = (row as { events: { id: string; title: string; start_time: string; end_time: string; location_name: string | null } }).events
    const sim = titleSimilarity(title, ev.title)
    // Match if title 50%+ similar OR location matches
    const locMatch = location && ev.location_name && ev.location_name.toLowerCase().includes(location.toLowerCase().slice(0, 10))
    if (sim >= 0.5 || locMatch) return ev
  }
  return null
}

// ── Conflict detection ────────────────────────────────────────────

function minutesDiff(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000
}

// ── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const [llmRes, familyRes] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('family_members').select('id, name, role').order('sort_order'),
  ])
  const llm = llmRes.data?.value as { api_key: string; model?: string; provider?: string } | null
  if (!llm?.api_key) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }
  const familyMembers = (familyRes.data ?? []) as { id: string; name: string; role: string }[]

  const body = await req.json().catch(() => ({}))
  const targetMemberId: string | null = body.family_member_id ?? null

  let query = sb.from('google_tokens')
    .select('family_member_id, refresh_token, access_token, expires_at, gmail_history_id')
    .eq('gmail_scan_enabled', true)
  if (targetMemberId) query = query.eq('family_member_id', targetMemberId)
  const { data: tokens } = await query

  const results: { member_id: string; scanned: number; created: number; updated: number; travel: number; skipped: number; conflicts: number; error?: string }[] = []

  for (const tok of (tokens ?? [])) {
    const memberId = tok.family_member_id
    let accessToken = tok.access_token

    // Refresh if needed
    if (!accessToken || !tok.expires_at || new Date(tok.expires_at) < new Date(Date.now() + 60_000)) {
      const refreshed = await refreshToken(tok.refresh_token, clientId, clientSecret)
      if (!refreshed) { results.push({ member_id: memberId, scanned: 0, created: 0, updated: 0, travel: 0, skipped: 0, conflicts: 0, error: 'token refresh failed' }); continue }
      accessToken = refreshed.access_token
      await sb.from('google_tokens').update({
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('family_member_id', memberId)
    }

    const { messages, newHistoryId } = await getRecentMessages(accessToken, tok.gmail_history_id)
    if (newHistoryId) {
      await sb.from('google_tokens').update({ gmail_history_id: newHistoryId }).eq('family_member_id', memberId)
    }

    let scanned = 0, created = 0, updated = 0, travel = 0, skipped = 0, conflicts = 0

    for (const { id: msgId } of messages) {
      // Skip already-processed
      const { data: alreadyDone } = await sb.from('gmail_processed_messages')
        .select('id').eq('family_member_id', memberId).eq('gmail_message_id', msgId).maybeSingle()
      if (alreadyDone) continue

      const details = await getMessageDetails(msgId, accessToken)
      if (!details) continue
      scanned++

      const searchText = `${details.subject} ${details.snippet}`
      const isTravel = TRAVEL_KEYWORDS.test(searchText) || TRAVEL_SENDER_DOMAINS.some(d => details.from.toLowerCase().includes(d))
      const isCalendar = CALENDAR_KEYWORDS.test(searchText)

      if (!isTravel && !isCalendar) {
        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from,
          received_at: details.date ? new Date(details.date).toISOString() : null,
          intent: 'skip', skipped_reason: 'no keywords',
        }, { onConflict: 'family_member_id,gmail_message_id' })
        skipped++
        continue
      }

      // ── AI classification ──────────────────────────────────────
      const classified = await classifyEmail(details.subject, details.from, details.date, details.body, familyMembers, llm)

      if (!classified || classified.intent === 'skip') {
        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from,
          received_at: details.date ? new Date(details.date).toISOString() : null,
          intent: 'skip', skipped_reason: classified?.skip_reason ?? 'AI skipped',
          email_body: details.body.slice(0, 8000),
        }, { onConflict: 'family_member_id,gmail_message_id' })
        skipped++
        continue
      }

      const emailReceivedAt = details.date ? new Date(details.date).toISOString() : new Date().toISOString()

      // ── INTENT: travel_detail ──────────────────────────────────
      if (classified.intent === 'travel_detail' || isTravel) {
        // Check if a trip from this email already exists with newer data
        const { data: existingTrip } = await sb.from('trips')
          .select('id, source_email_received_at, gmail_message_ids')
          .eq('family_member_id', memberId)
          .contains('gmail_message_ids', [msgId])
          .maybeSingle()

        if (existingTrip) {
          // Already processed — check if this email is newer (shouldn't happen on first run but handles re-delivery)
          if (existingTrip.source_email_received_at && new Date(emailReceivedAt) <= new Date(existingTrip.source_email_received_at)) {
            await sb.from('gmail_processed_messages').upsert({
              family_member_id: memberId, gmail_message_id: msgId,
              subject: details.subject, email_subject: details.subject,
              from_email: details.from, received_at: emailReceivedAt,
              intent: 'travel_detail', skipped_reason: 'older than existing trip record',
            }, { onConflict: 'family_member_id,gmail_message_id' })
            skipped++
            continue
          }
        }

        // Invoke scan-travel-emails inline with raw_text mode
        // Find a matching travel event for this member
        const { data: matchEvt } = await sb
          .from('event_members')
          .select('events!inner(id, start_time)')
          .eq('family_member_id', memberId)
          .limit(10)

        // Find the closest upcoming travel event
        const travelEventId = matchEvt
          ? (matchEvt as { events: { id: string; start_time: string } }[])
              .map(r => r.events)
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
              .find(e => new Date(e.start_time) > new Date())?.id
          : undefined

        const travelRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/scan-travel-emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            raw_text: details.body.slice(0, 20000),
            source_subject: details.subject,
            family_member_id: memberId,
            event_id: travelEventId,
            existing_trip_id: existingTrip?.id,
          }),
        })
        const travelResult = travelRes.ok ? await travelRes.json() : null

        // Update source_email_received_at on the newly created/updated trip
        if (travelResult?.ok) {
          await sb.from('trips')
            .update({ source_email_received_at: emailReceivedAt })
            .eq('family_member_id', memberId)
            .contains('gmail_message_ids', [msgId])
        }

        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from, received_at: emailReceivedAt,
          intent: 'travel_detail',
          email_body: details.body.slice(0, 8000),
        }, { onConflict: 'family_member_id,gmail_message_id' })
        travel++
        continue
      }

      const isUnknown = (v?: string) => !v || v === 'unknown'
      const startIso  = isUnknown(classified.start_datetime) ? null : classified.start_datetime!
      const endIso    = isUnknown(classified.end_datetime)   ? null : classified.end_datetime!
      const startTime = startIso ? new Date(startIso) : null
      const endTime   = endIso   ? new Date(endIso)   : startTime ? new Date(startTime.getTime() + 3600_000) : null

      // Resolve which family member this is for
      const assignedMember = familyMembers.find(m =>
        classified.assigned_member && m.name.toLowerCase().includes(classified.assigned_member.toLowerCase())
      ) ?? familyMembers.find(m => m.id === memberId) ?? familyMembers[0]

      // ── INTENT: update_event ───────────────────────────────────
      if (classified.intent === 'update_event') {
        // Find the event being updated
        const searchTitle = classified.updates_event_title ?? classified.title ?? ''
        const searchDate  = classified.updates_event_date ?? classified.start_datetime ?? 'unknown'
        const matchedEvent = await findMatchingEvent(sb, assignedMember.id, searchTitle, searchDate, classified.location ?? '')

        if (matchedEvent && startTime) {
          const timeDiff = minutesDiff(matchedEvent.start_time, startTime.toISOString())
          const locationChanged = classified.location && matchedEvent.location_name &&
            !matchedEvent.location_name.toLowerCase().includes((classified.location ?? '').toLowerCase().slice(0, 8))

          // Surface as conflict if time moved >15 min or location changed
          if (timeDiff > 15 || locationChanged) {
            await sb.from('email_conflicts').insert({
              family_member_id: memberId,
              gmail_message_id: msgId,
              event_id: matchedEvent.id,
              conflict_type: timeDiff > 15 ? 'time_change' : 'location_change',
              field_name: timeDiff > 15 ? 'start_time' : 'location_name',
              old_value: timeDiff > 15 ? matchedEvent.start_time : matchedEvent.location_name,
              new_value: timeDiff > 15 ? startTime.toISOString() : classified.location,
              email_subject: details.subject,
              email_from: details.from,
            })
            conflicts++
          }

          // Apply update (email = source of truth)
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (startTime) patch.start_time = startTime.toISOString()
          if (endTime) patch.end_time = endTime.toISOString()
          if (classified.location) patch.location_name = classified.location
          if (classified.description) patch.description = classified.description
          await sb.from('events').update(patch).eq('id', matchedEvent.id)

          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            subject: details.subject, email_subject: details.subject,
            from_email: details.from, received_at: emailReceivedAt,
            intent: 'update_event', updated_event_id: matchedEvent.id,
            email_body: details.body.slice(0, 8000),
          }, { onConflict: 'family_member_id,gmail_message_id' })
          updated++
        } else {
          // Can't find the event to update — treat as new
          classified.intent = 'new_event'
          // fall through to new_event below
        }
        if (classified.intent === 'update_event') continue
      }

      // ── INTENT: new_event ──────────────────────────────────────
      if (!startTime) {
        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from, received_at: emailReceivedAt,
          intent: 'skip', skipped_reason: 'no parseable start time',
        }, { onConflict: 'family_member_id,gmail_message_id' })
        skipped++
        continue
      }

      // Dedup check — don't create if a similar event already exists
      const existingMatch = await findMatchingEvent(sb, assignedMember.id, classified.title ?? '', startIso ?? '', classified.location ?? '')
      if (existingMatch) {
        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from, received_at: emailReceivedAt,
          intent: 'skip', skipped_reason: `duplicate of event: ${existingMatch.title}`,
        }, { onConflict: 'family_member_id,gmail_message_id' })
        skipped++
        continue
      }

      // Create new event
      const { data: newEvent } = await sb.from('events').insert({
        title: classified.title ?? details.subject.slice(0, 60),
        description: classified.description || `Imported from email: ${details.subject}`,
        start_time: startTime.toISOString(),
        end_time: (endTime ?? new Date(startTime.getTime() + 3600_000)).toISOString(),
        all_day: classified.all_day ?? false,
        location_name: classified.location || null,
        source_member_id: assignedMember.id,
      }).select('id').single()

      if (newEvent) {
        await sb.from('event_members').insert({ event_id: newEvent.id, family_member_id: assignedMember.id, role: 'primary' })

        // Push to Google Calendar
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            summary: classified.title,
            description: classified.description,
            location: classified.location || undefined,
            start: classified.all_day ? { date: startTime.toISOString().split('T')[0] } : { dateTime: startTime.toISOString() },
            end:   classified.all_day ? { date: (endTime ?? startTime).toISOString().split('T')[0] } : { dateTime: (endTime ?? new Date(startTime.getTime() + 3600_000)).toISOString() },
          }),
        }).catch(console.error)

        // Trigger AI enrichment asynchronously
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-event`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'content-type': 'application/json' },
          body: JSON.stringify({ event_id: newEvent.id }),
        }).catch(() => {})

        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          subject: details.subject, email_subject: details.subject,
          from_email: details.from, received_at: emailReceivedAt,
          intent: 'new_event', created_event_id: newEvent.id,
          email_body: details.body.slice(0, 8000),
        }, { onConflict: 'family_member_id,gmail_message_id' })
        created++
      }
    }

    results.push({ member_id: memberId, scanned, created, updated, travel, skipped, conflicts })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, 'content-type': 'application/json' } })
})
