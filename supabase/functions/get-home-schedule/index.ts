// get-home-schedule
// Public API for external AI tools (Claude Desktop MCP, etc.)
// Returns today + N days (default 5) of home/family calendar events.
//
// Auth: Bearer token must match HOME_SCHEDULE_API_KEY env var (set in Supabase secrets).
// GET  /functions/v1/get-home-schedule?days=5&tz=America/New_York
// POST /functions/v1/get-home-schedule  { days?: number, tz?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key',
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

// Start-of-day (midnight) for a given date in a timezone, returned as UTC ISO string.
function dayStartUTC(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const local = fmt.format(date) // e.g. "2026-06-16"
  return new Date(`${local}T00:00:00`).toISOString().replace(
    /T.*/, `T${new Date(`${local}T00:00:00`).toISOString().slice(11)}`,
  )
}

// Build a clean UTC ISO range from local date string + timezone.
function buildRange(tz: string, days: number): { start: string; end: string } {
  const now = new Date()
  // Today midnight in target timezone
  const localNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)

  // Parse back to UTC for start-of-day
  const startLocal = new Date(`${localNow}T00:00:00`)
  // Adjust for timezone offset: compute what UTC instant = midnight in that tz
  const utcOffset = (now.getTime() - new Date(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(now).replace(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6')
  ).getTime())

  const start = new Date(startLocal.getTime() - utcOffset).toISOString()
  const end   = new Date(startLocal.getTime() - utcOffset + days * 24 * 60 * 60 * 1000).toISOString()
  return { start, end }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const apiKey = requireEnv('HOME_SCHEDULE_API_KEY')
  const authHeader = req.headers.get('authorization') ?? req.headers.get('x-api-key') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (token !== apiKey) {
    return jsonResp({ error: 'Unauthorized — invalid API key' }, 401)
  }

  // ── Params ────────────────────────────────────────────────────────────────
  let days = 5, tz = 'America/New_York'
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('days')) days = Math.min(14, Math.max(1, Number(url.searchParams.get('days'))))
    if (url.searchParams.get('tz')) tz = url.searchParams.get('tz')!
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.days) days = Math.min(14, Math.max(1, Number(body.days)))
      if (body.tz) tz = body.tz
    }
  } catch { /* use defaults */ }

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))

  // ── Date range ────────────────────────────────────────────────────────────
  const now = new Date()
  const rangeStart = now.toISOString()
  const rangeEnd   = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

  // ── Events ────────────────────────────────────────────────────────────────
  const { data: events, error: evErr } = await sb
    .from('events')
    .select(`
      id, title, start_time, end_time, all_day, location_name, description,
      event_type, status,
      event_members(family_members(name)),
      event_enrichments(category, prep_notes, what_to_bring, outfit_suggestion)
    `)
    .gte('start_time', rangeStart)
    .lte('start_time', rangeEnd)
    .or('status.is.null,status.eq.confirmed,status.neq.cancelled')
    .order('start_time')

  if (evErr) return jsonResp({ error: evErr.message }, 500)

  // ── Reminders ──────────────────────────────────────────────────────────────
  const { data: reminders } = await sb
    .from('events')
    .select('id, title, start_time, end_time, event_type, status, description')
    .eq('event_type', 'reminder')
    .gte('start_time', rangeStart)
    .lte('start_time', rangeEnd)
    .or('status.is.null,status.neq.cancelled')
    .order('start_time')

  // ── Family members (for context) ──────────────────────────────────────────
  const { data: family } = await sb
    .from('family_members')
    .select('name, role')
    .order('sort_order')

  // ── Format events per day ─────────────────────────────────────────────────
  const dayMap: Record<string, unknown[]> = {}

  for (const ev of events ?? []) {
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ev.start_time))

    const who = (ev.event_members ?? [])
      .map((em: { family_members: { name: string } | null }) => em.family_members?.name)
      .filter(Boolean)

    const enrichment = ev.event_enrichments?.[0]

    if (!dayMap[localDate]) dayMap[localDate] = []
    dayMap[localDate].push({
      id: ev.id,
      title: ev.title,
      start: new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(ev.start_time)),
      end: ev.end_time ? new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(ev.end_time)) : null,
      start_iso: ev.start_time,
      end_iso: ev.end_time,
      all_day: ev.all_day ?? false,
      type: ev.event_type ?? 'event',
      location: ev.location_name ?? null,
      who,
      
      description: ev.description ?? null,
      category: enrichment?.category ?? null,
      prep_notes: enrichment?.prep_notes ?? null,
    })
  }

  // Build ordered day list
  const schedule = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayEvents]) => ({
      date,
      day_of_week: new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'long',
      }).format(new Date(date + 'T12:00:00')),
      event_count: dayEvents.length,
      events: dayEvents,
    }))

  // ── Response ───────────────────────────────────────────────────────────────
  return jsonResp({
    meta: {
      generated_at: now.toISOString(),
      timezone: tz,
      range_start: rangeStart,
      range_end: rangeEnd,
      days_requested: days,
      total_events: (events ?? []).length,
    },
    household: {
      members: (family ?? []).map(m => ({ name: m.name, role: m.role })),
    },
    schedule,
    reminders_in_range: (reminders ?? []).map(r => ({
      title: r.title,
      due: r.start_time ? new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(r.start_time)) : null,
      due_iso: r.start_time,
      notes: r.description ?? null,
    })),
  })
})
