/**
 * analyze-conflicts — runs after any event create/update.
 * Scans a date range for:
 *   1. TIME_CONFLICT   — same person tagged on two overlapping events
 *   2. TRANSPORT_GAP   — child has an event but no parent is free to drive them
 *
 * Existing unresolved conflicts for the affected day are replaced so we
 * never accumulate stale alerts.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const body = await req.json().catch(() => ({}))
  const now = new Date()
  // Start from beginning of today so we don't miss events earlier today
  const rangeStart = body.range_start ? new Date(body.range_start) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = body.range_end
    ? new Date(body.range_end)
    : new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000)

  // ── Purge conflicts for past events before scanning ──
  // Any unresolved conflict whose event start_time is before today is stale — auto-resolve it.
  // This prevents yesterday's conflicts from lingering on the display indefinitely.
  const { data: pastEvents } = await sb
    .from('events')
    .select('id')
    .lt('start_time', rangeStart.toISOString())
  const pastEventIds = (pastEvents ?? []).map((e: { id: string }) => e.id)
  if (pastEventIds.length > 0) {
    await sb
      .from('conflicts')
      .update({ resolved: true, resolution: 'auto-expired', resolved_at: now.toISOString() })
      .eq('resolved', false)
      .or(`event_a_id.in.(${pastEventIds.join(',')}),event_b_id.in.(${pastEventIds.join(',')})`)
  }

  // ── Load all family members ──
  const { data: members, error: memErr } = await sb
    .from('family_members')
    .select('id, name, role')
    .order('sort_order')
  if (memErr || !members) return err('Failed to load family members')

  const parents = members.filter((m: { role: string }) => m.role === 'parent')
  const children = members.filter((m: { role: string }) => m.role === 'child')

  // ── Load all events + members in range ──
  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, event_members(family_member_id, role)')
    .gte('start_time', rangeStart.toISOString())
    .lte('start_time', rangeEnd.toISOString())
    .neq('status', 'cancelled')
    .order('start_time')

  if (evErr || !events) return err('Failed to load events')

  type EventRow = {
    id: string; title: string; start_time: string; end_time: string;
    event_members: { family_member_id: string; role: string }[]
  }

  const newConflicts: {
    event_a_id: string
    event_b_id: string | null
    conflict_type: string
    severity: number
    description: string
    resolved: boolean
  }[] = []

  // ── 1. TIME CONFLICT: same person on two overlapping events ──
  for (const ev of events as EventRow[]) {
    const startA = new Date(ev.start_time).getTime()
    // Guard: if end_time is missing, assume 1-hour duration
    const endA = ev.end_time ? new Date(ev.end_time).getTime() : startA + 60 * 60 * 1000
    const memberIds = (ev.event_members ?? []).map((m) => m.family_member_id)

    for (const other of events as EventRow[]) {
      if (other.id <= ev.id) continue // avoid duplicates
      const startB = new Date(other.start_time).getTime()
      const endB = other.end_time ? new Date(other.end_time).getTime() : startB + 60 * 60 * 1000
      if (endA <= startB || endB <= startA) continue // no overlap

      const otherMemberIds = (other.event_members ?? []).map((m) => m.family_member_id)
      const sharedMembers = memberIds.filter((id) => otherMemberIds.includes(id))
      if (sharedMembers.length === 0) continue

      const names = sharedMembers
        .map((id) => members.find((m: { id: string }) => m.id === id)?.name ?? id)
        .join(', ')

    newConflicts.push({
        event_a_id: ev.id,
        event_b_id: other.id,
        conflict_type: 'double_book',
        severity: 2,
        description: `${names} is double-booked: "${ev.title}" overlaps with "${other.title}"`,
        resolved: false,
      })
    }
  }

  // ── 2. TRANSPORT GAP: child has event, no free parent at that time ──
  for (const ev of events as EventRow[]) {
    const memberIds = (ev.event_members ?? []).map((m) => m.family_member_id)
    const childrenOnEvent = children.filter((c: { id: string }) => memberIds.includes(c.id))
    if (childrenOnEvent.length === 0) continue

    const startA = new Date(ev.start_time).getTime()
    const endA = ev.end_time ? new Date(ev.end_time).getTime() : startA + 60 * 60 * 1000

    // Check if ALL parents are busy during this event's time
    const freeparents = parents.filter((parent: { id: string }) => {
      const parentBusy = (events as EventRow[]).some((other) => {
        if (other.id === ev.id) return false
        const startB = new Date(other.start_time).getTime()
        const endB = other.end_time ? new Date(other.end_time).getTime() : startB + 60 * 60 * 1000
        if (endA <= startB || endB <= startA) return false
        return (other.event_members ?? []).some((m) => m.family_member_id === parent.id)
      })
      return !parentBusy
    })

    if (freeparents.length > 0) continue // at least one parent is free — no issue

    // No free parents
    const childNames = childrenOnEvent.map((c: { name: string }) => c.name).join(', ')
    const parentNames = parents.map((p: { name: string }) => p.name).join(' & ')
    const timeStr = new Date(ev.start_time).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })

    newConflicts.push({
      event_a_id: ev.id,
      event_b_id: null,
      conflict_type: 'drive_time',
      severity: 3,
      description: `${childNames} needs a ride to "${ev.title}" at ${timeStr} but ${parentNames} ${parents.length > 1 ? 'are' : 'is'} both busy`,
      resolved: false,
    })
  }

  // ── Find already-resolved conflicts for these events (don't resurrect dismissed ones) ──
  const eventIds = (events as EventRow[]).map((e) => e.id)
  const { data: existingResolved } = await sb
    .from('conflicts')
    .select('event_a_id, event_b_id, conflict_type')
    .or(`event_a_id.in.(${eventIds.join(',')}),event_b_id.in.(${eventIds.join(',')})`)
    .eq('resolved', true)

  const resolvedKeys = new Set(
    (existingResolved ?? []).map((r: { event_a_id: string; event_b_id: string | null; conflict_type: string }) =>
      `${r.event_a_id}::${r.event_b_id ?? ''}::${r.conflict_type}`
    )
  )

  // ── Delete stale UNRESOLVED conflicts for this range, then insert new ones ──
  if (eventIds.length > 0) {
    await sb
      .from('conflicts')
      .delete()
      .eq('resolved', false)
      .or(`event_a_id.in.(${eventIds.join(',')}),event_b_id.in.(${eventIds.join(',')})`)
  }

  // Skip re-inserting anything the user already resolved/dismissed
  const freshConflicts = newConflicts.filter(
    (c) => !resolvedKeys.has(`${c.event_a_id}::${c.event_b_id ?? ''}::${c.conflict_type}`)
  )

  if (freshConflicts.length > 0) {
    const { error: insertErr } = await sb.from('conflicts').upsert(freshConflicts, {
      onConflict: 'event_a_id,event_b_id',
      ignoreDuplicates: true,
    })
    if (insertErr) {
      console.error('[analyze-conflicts] Upsert error:', insertErr)
      return err(`Upsert failed: ${insertErr.message}`)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, found: freshConflicts.length, skipped_resolved: newConflicts.length - freshConflicts.length }),
    { headers: { ...CORS, 'content-type': 'application/json' } },
  )
})

function err(msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
