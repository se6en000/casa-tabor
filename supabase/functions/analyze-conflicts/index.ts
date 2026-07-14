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

type AvailabilityRule = {
  member_id: string
  day_of_week: number
  start_local: string
  end_local: string
  availability_type: 'unavailable' | 'available'
  timezone: string | null
  reason: string | null
}

type AvailabilityException = {
  member_id: string
  start_at: string
  end_at: string
  override_type: 'day_off' | 'manual_block' | 'manual_available'
  note: string | null
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function toMinutes(timeValue: string): number {
  const [h, m] = timeValue.split(':').map((value) => Number.parseInt(value, 10))
  return (h * 60) + m
}

function zonedParts(dateValue: Date, timezone: string): { weekday: number; minutes: number } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateValue)
  const weekdayName = formatted.find((part) => part.type === 'weekday')?.value ?? 'Sun'
  const hour = Number.parseInt(formatted.find((part) => part.type === 'hour')?.value ?? '0', 10)
  const minute = Number.parseInt(formatted.find((part) => part.type === 'minute')?.value ?? '0', 10)
  return {
    weekday: WEEKDAY_INDEX[weekdayName] ?? 0,
    minutes: (hour * 60) + minute,
  }
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function ruleOverlapsWindow(rule: AvailabilityRule, startAt: Date, endAt: Date): boolean {
  const tz = rule.timezone || 'America/New_York'
  const start = zonedParts(startAt, tz)
  const end = zonedParts(endAt, tz)
  const ruleStart = toMinutes(rule.start_local)
  const ruleEnd = toMinutes(rule.end_local)

  if (start.weekday === end.weekday) {
    if (start.weekday !== rule.day_of_week) return false
    return rangesOverlap(start.minutes, end.minutes, ruleStart, ruleEnd)
  }
  if (start.weekday === rule.day_of_week && rangesOverlap(start.minutes, 24 * 60, ruleStart, ruleEnd)) return true
  if (end.weekday === rule.day_of_week && rangesOverlap(0, end.minutes, ruleStart, ruleEnd)) return true
  return false
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
    .select('id, name, role, can_drive, availability_mode')
    .order('sort_order')
  if (memErr || !members) return err('Failed to load family members')

  const drivers = members.filter((m: { role: string; can_drive: boolean | null }) =>
    (m.role === 'parent' || m.role === 'caregiver') && (m.can_drive ?? true),
  )
  const children = members.filter((m: { role: string }) => m.role === 'child')

  const driverIds = drivers.map((driver: { id: string }) => driver.id)
  const [{ data: rulesRaw, error: rulesErr }, { data: exceptionsRaw, error: exceptionsErr }] = await Promise.all([
    driverIds.length > 0
      ? sb
        .from('member_availability_rules')
        .select('member_id, day_of_week, start_local, end_local, availability_type, timezone, reason')
        .in('member_id', driverIds)
      : Promise.resolve({ data: [], error: null }),
    driverIds.length > 0
      ? sb
        .from('member_availability_exceptions')
        .select('member_id, start_at, end_at, override_type, note')
        .in('member_id', driverIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (rulesErr) return err(`Failed to load availability rules: ${rulesErr.message}`)
  if (exceptionsErr) return err(`Failed to load availability exceptions: ${exceptionsErr.message}`)
  const rulesByMember = new Map<string, AvailabilityRule[]>()
  for (const rule of (rulesRaw ?? []) as AvailabilityRule[]) {
    const existing = rulesByMember.get(rule.member_id)
    if (existing) existing.push(rule)
    else rulesByMember.set(rule.member_id, [rule])
  }
  const exceptionsByMember = new Map<string, AvailabilityException[]>()
  for (const exception of (exceptionsRaw ?? []) as AvailabilityException[]) {
    const existing = exceptionsByMember.get(exception.member_id)
    if (existing) existing.push(exception)
    else exceptionsByMember.set(exception.member_id, [exception])
  }

  // ── Load all events + members in range ──
  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, start_time, end_time, event_type, event_members(family_member_id, role)')
    .gte('start_time', rangeStart.toISOString())
    .lte('start_time', rangeEnd.toISOString())
    .neq('status', 'cancelled')
    .order('start_time')

  if (evErr || !events) return err('Failed to load events')

  type EventRow = {
    id: string; title: string; start_time: string; end_time: string;
    event_type: 'event' | 'reminder';
    event_members: { family_member_id: string; role: string }[]
  }
  const rangeEvents = events as EventRow[]
  const conflictEligibleEvents = rangeEvents.filter((event) => event.event_type !== 'reminder')

  type DriverRow = {
    id: string
    role: string
    name: string
    availability_mode: 'strict' | 'flexible' | 'open' | null
  }

  function driverBlockedByAvailability(driver: DriverRow, startAt: Date, endAt: Date): boolean {
    const exceptions = exceptionsByMember.get(driver.id) ?? []
    const overlappingExceptions = exceptions.filter((exception) => {
      const exStart = new Date(exception.start_at).getTime()
      const exEnd = new Date(exception.end_at).getTime()
      return exStart < endAt.getTime() && exEnd > startAt.getTime()
    })

    if (overlappingExceptions.some((exception) => exception.override_type === 'day_off' || exception.override_type === 'manual_available')) {
      return false
    }
    if (overlappingExceptions.some((exception) => exception.override_type === 'manual_block')) {
      return true
    }

    if (driver.availability_mode === 'open' || driver.availability_mode === 'flexible') {
      return false
    }

    const rules = (rulesByMember.get(driver.id) ?? []).filter((rule) => rule.availability_type === 'unavailable')
    return rules.some((rule) => ruleOverlapsWindow(rule, startAt, endAt))
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
  for (const ev of conflictEligibleEvents) {
    const startA = new Date(ev.start_time).getTime()
    // Guard: if end_time is missing, assume 1-hour duration
    const endA = ev.end_time ? new Date(ev.end_time).getTime() : startA + 60 * 60 * 1000
    const memberIds = (ev.event_members ?? []).map((m) => m.family_member_id)

    for (const other of conflictEligibleEvents) {
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

  // ── 2. TRANSPORT GAP: child has event, no free driver at that time ──
  for (const ev of conflictEligibleEvents) {
    const memberIds = (ev.event_members ?? []).map((m) => m.family_member_id)
    const childrenOnEvent = children.filter((c: { id: string }) => memberIds.includes(c.id))
    if (childrenOnEvent.length === 0) continue

    const startA = new Date(ev.start_time)
    const endA = ev.end_time ? new Date(ev.end_time) : new Date(startA.getTime() + 60 * 60 * 1000)

    // Check if all potential drivers are busy or unavailable during this event's time.
    const freeDrivers = (drivers as DriverRow[]).filter((driver) => {
      const parentBusy = conflictEligibleEvents.some((other) => {
        if (other.id === ev.id) return false
        const startB = new Date(other.start_time).getTime()
        const endB = other.end_time ? new Date(other.end_time).getTime() : startB + 60 * 60 * 1000
        if (endA.getTime() <= startB || endB <= startA.getTime()) return false
        return (other.event_members ?? []).some((m) => m.family_member_id === driver.id)
      })
      if (parentBusy) return false
      return !driverBlockedByAvailability(driver, startA, endA)
    })

    if (freeDrivers.length > 0) continue // at least one driver is free — no issue

    // No free drivers
    const childNames = childrenOnEvent.map((c: { name: string }) => c.name).join(', ')
    const driverNames = (drivers as DriverRow[]).map((driver) => driver.name).join(' & ')
    const timeStr = new Date(ev.start_time).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })

    newConflicts.push({
      event_a_id: ev.id,
      event_b_id: null,
      conflict_type: 'drive_time',
      severity: 3,
      description: `${childNames} needs a ride to "${ev.title}" at ${timeStr} but ${driverNames || 'all drivers'} ${drivers.length > 1 ? 'are' : 'is'} unavailable`,
      resolved: false,
    })
  }

  // ── Find already-resolved conflicts for these events (don't resurrect dismissed ones) ──
  const eventIds = rangeEvents.map((e) => e.id)
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
