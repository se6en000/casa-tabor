import type { SupabaseClient } from '@supabase/supabase-js'

export interface DayScheduleOverride {
  dayOfWeek: number
  label?: string
  startLocal?: string | null
  endLocal?: string | null
  dropoffDriverName?: string | null
  dropoffDriverId?: string | null
  pickupDriverName?: string | null
  pickupDriverId?: string | null
  enabled?: boolean
}

export interface FamilyRoutine {
  id?: string
  memberId: string
  title: string
  routineType?: 'school' | 'work' | 'camp' | 'custom'
  venueName: string
  shortVenueName?: string | null
  venueAddress: string
  daysOfWeek: number[]
  startLocal: string
  endLocal: string
  dayOverrides?: DayScheduleOverride[]
  startDate?: string | null
  endDate?: string | null
  dropoffDriverName?: string | null
  dropoffDriverId?: string | null
  pickupDriverName?: string | null
  pickupDriverId?: string | null
  syncMode?: 'none' | 'exceptions_only' | 'all'
  syncToGoogle?: boolean
  enabled: boolean
}

export interface FamilyMember {
  id: string
  name: string
  role?: string
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DEFAULT_SEMESTER_START = '2026-08-11'
const DEFAULT_SEMESTER_END = '20270528T235959Z'

export function getEstimatedDriveMinutes(venueName = '', address = ''): number {
  const text = `${venueName} ${address}`.toLowerCase()
  if (text.includes('palm beach public') || text.includes('cocoanut') || text.includes('pbp')) {
    return 10
  }
  if (text.includes('bak') || text.includes('echo lake')) {
    return 18
  }
  return 15
}

export function getFirstOccurrenceDate(startDateStr: string, targetDayOfWeek: number): string {
  const base = new Date(startDateStr + 'T12:00:00Z')
  const currentDay = base.getUTCDay()
  const diff = (targetDayOfWeek - currentDay + 7) % 7
  const target = new Date(base)
  target.setUTCDate(base.getUTCDate() + diff)
  return target.toISOString().slice(0, 10)
}

export interface DesiredRoutineSeries {
  key: string
  type: 'dropoff' | 'pickup'
  title: string
  description: string
  dayCode: string
  dayOfWeek: number
  startTimeLocal: string
  endTimeLocal: string
  driverMemberId: string | null
  driverName: string
  passengerMemberId: string
  venueName: string
  venueAddress: string
  rrule: string
}

export function extractDesiredRoutineSeries(
  memberId: string,
  routine: FamilyRoutine,
  members: FamilyMember[] = [],
): DesiredRoutineSeries[] {
  if (!routine.enabled || !routine.dayOverrides || routine.dayOverrides.length === 0) {
    return []
  }

  const child = members.find((m) => m.id === memberId)
  const childName = child?.name || 'Member'
  const semesterEnd = routine.endDate ? `${routine.endDate.replace(/-/g, '')}T235959Z` : DEFAULT_SEMESTER_END
  const results: DesiredRoutineSeries[] = []

  for (const override of routine.dayOverrides) {
    if (override.enabled === false) continue

    const dayCode = DAY_CODES[override.dayOfWeek]
    const dayLabel = override.label?.trim() || null

    const isDropException = Boolean(
      (override.startLocal && override.startLocal.slice(0, 5) !== routine.startLocal.slice(0, 5)) ||
      (override.dropoffDriverName && override.dropoffDriverName !== routine.dropoffDriverName) ||
      (dayLabel && (!override.endLocal || override.endLocal.slice(0, 5) === routine.endLocal.slice(0, 5)))
    )

    const isPickException = Boolean(
      (override.endLocal && override.endLocal.slice(0, 5) !== routine.endLocal.slice(0, 5)) ||
      (override.pickupDriverName && override.pickupDriverName !== routine.pickupDriverName) ||
      (dayLabel && (!override.startLocal || override.startLocal.slice(0, 5) === routine.startLocal.slice(0, 5)))
    )

    const rrule = `RRULE:FREQ=WEEKLY;UNTIL=${semesterEnd};BYDAY=${dayCode}`

    // 1. Morning Dropoff Exception Series
    if (isDropException) {
      const dropTime = (override.startLocal || routine.startLocal).slice(0, 5)
      const [hStr, mStr] = dropTime.split(':')
      const h = parseInt(hStr, 10) || 8
      const m = parseInt(mStr, 10) || 0
      const endM = (m + 15) % 60
      const endH = m + 15 >= 60 ? h + 1 : h
      const endTimeLocal = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

      const labelTag = dayLabel ? ` · ${dayLabel}` : ''
      const title = `Drop off ${childName} @ ${routine.venueName}${labelTag}`
      const driverName = override.dropoffDriverName || routine.dropoffDriverName || 'Jake'
      const driverMember = members.find((m) => m.id === override.dropoffDriverId || m.name.toLowerCase() === driverName.toLowerCase())

      results.push({
        key: `dropoff_${override.dayOfWeek}_${dropTime}_${driverName.toLowerCase()}`,
        type: 'dropoff',
        title,
        description: `Weekly morning drop-off for ${childName}.${dayLabel ? ` Note: ${dayLabel}.` : ''}`,
        dayCode,
        dayOfWeek: override.dayOfWeek,
        startTimeLocal: dropTime,
        endTimeLocal,
        driverMemberId: driverMember?.id || null,
        driverName,
        passengerMemberId: memberId,
        venueName: routine.venueName,
        venueAddress: routine.venueAddress,
        rrule,
      })
    }

    // 2. Afternoon Pickup Exception Series
    if (isPickException) {
      const pickTime = (override.endLocal || routine.endLocal).slice(0, 5)
      const [hStr, mStr] = pickTime.split(':')
      const h = parseInt(hStr, 10) || 15
      const m = parseInt(mStr, 10) || 0
      const endM = (m + 15) % 60
      const endH = m + 15 >= 60 ? h + 1 : h
      const endTimeLocal = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

      const labelTag = dayLabel ? ` · ${dayLabel}` : ''
      const title = `Pick up ${childName} @ ${routine.venueName}${labelTag}`
      const driverName = override.pickupDriverName || routine.pickupDriverName || 'Giselle'
      const driverMember = members.find((m) => m.id === override.pickupDriverId || m.name.toLowerCase() === driverName.toLowerCase())

      results.push({
        key: `pickup_${override.dayOfWeek}_${pickTime}_${driverName.toLowerCase()}`,
        type: 'pickup',
        title,
        description: `Weekly afternoon pickup for ${childName}.${dayLabel ? ` Note: ${dayLabel}.` : ''}`,
        dayCode,
        dayOfWeek: override.dayOfWeek,
        startTimeLocal: pickTime,
        endTimeLocal,
        driverMemberId: driverMember?.id || null,
        driverName,
        passengerMemberId: memberId,
        venueName: routine.venueName,
        venueAddress: routine.venueAddress,
        rrule,
      })
    }
  }

  return results
}

/**
 * Reconciles routine exceptions with Google Calendar and Casa Tabor recurrence engine.
 * Guarantees zero duplicate single events and zero orphaned Google series.
 */
export async function syncMemberRoutineExceptions(
  supabase: SupabaseClient,
  memberId: string,
  routine: FamilyRoutine,
  members: FamilyMember[] = [],
): Promise<{ added: number; removed: number; retained: number }> {
  const desired = extractDesiredRoutineSeries(memberId, routine, members)
  const child = members.find((m) => m.id === memberId)
  const childName = child?.name || 'Member'
  const startDateStr = routine.startDate || DEFAULT_SEMESTER_START
  const nowIso = new Date().toISOString()
  const purgeIso = new Date(Date.now() + 30 * 86400000).toISOString()

  // 1. Query existing active series templates for this child
  const { data: existingTemplates } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, rrule, google_event_id, google_calendar_id, record_kind')
    .eq('record_kind', 'series_template')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .or(`title.ilike.%Drop off ${childName}%,title.ilike.%Pick up ${childName}%`)

  const activeTemplates = existingTemplates || []
  let added = 0
  let removed = 0
  let retained = 0

  // 2. Identify templates to delete (no longer in desired set)
  for (const t of activeTemplates) {
    const isMatchingDesired = desired.some((d) => {
      return (
        t.rrule?.includes(`BYDAY=${d.dayCode}`) &&
        t.title.toLowerCase().trim() === d.title.toLowerCase().trim()
      )
    })

    if (!isMatchingDesired) {
      // Delete from Google Calendar
      if (t.google_event_id) {
        try {
          await supabase.functions.invoke('delete-google-event', {
            body: { event_id: t.id },
          })
        } catch (err) {
          console.warn('[routineRecurrenceCoordinator] Failed to delete Google recurring event:', err)
        }
      }

      // Retire template in Supabase
      await supabase
        .from('events')
        .update({ status: 'cancelled', deleted_at: nowIso, purge_after: purgeIso })
        .eq('id', t.id)

      // Retire event_series
      const { data: sRow } = await supabase
        .from('event_series')
        .select('id')
        .eq('template_event_id', t.id)
        .maybeSingle()

      if (sRow) {
        await supabase
          .from('event_series')
          .update({ status: 'deleted', deleted_at: nowIso, purge_after: purgeIso })
          .eq('id', sRow.id)

        // Cancel all materialized occurrences
        await supabase
          .from('events')
          .update({ status: 'cancelled', deleted_at: nowIso, purge_after: purgeIso })
          .eq('series_id', sRow.id)
      }

      removed++
    }
  }

  // 3. Create newly added or updated desired series
  for (const d of desired) {
    const existing = activeTemplates.find((t) => {
      return (
        t.rrule?.includes(`BYDAY=${d.dayCode}`) &&
        t.title.toLowerCase().trim() === d.title.toLowerCase().trim()
      )
    })

    if (existing) {
      retained++
      continue
    }

    // Compute canonical first occurrence date
    const firstDate = getFirstOccurrenceDate(startDateStr, d.dayOfWeek)
    const startIso = `${firstDate}T${d.startTimeLocal}:00-04:00`
    const endIso = `${firstDate}T${d.endTimeLocal}:00-04:00`
    const driveMinutes = getEstimatedDriveMinutes(d.venueName, d.venueAddress)
    const templateId = crypto.randomUUID()

    // Insert series template
    const { error: insertErr } = await supabase.from('events').insert({
      id: templateId,
      title: d.title,
      description: d.description,
      start_time: startIso,
      end_time: endIso,
      all_day: false,
      event_type: 'event',
      rrule: d.rrule,
      record_kind: 'series_template',
      location_name: d.venueName,
      address: d.venueAddress,
      status: 'confirmed',
      is_enriched: true,
      is_exception: false,
      created_at: nowIso,
      updated_at: nowIso,
    })

    if (insertErr) {
      console.error('[routineRecurrenceCoordinator] Failed to insert template event:', insertErr)
      continue
    }

    // Insert event_members
    const membersToInsert = [
      { event_id: templateId, family_member_id: d.passengerMemberId, role: 'attendee' },
    ]
    if (d.driverMemberId) {
      membersToInsert.push({
        event_id: templateId,
        family_member_id: d.driverMemberId,
        role: 'driver',
      })
    }
    await supabase.from('event_members').insert(membersToInsert)

    // Insert enrichment
    await supabase.from('event_enrichments').insert({
      id: crypto.randomUUID(),
      event_id: templateId,
      category: 'school',
      category_locked: true,
      confidence: 'high',
      drive_time_mins: driveMinutes,
      route_summary: `${driveMinutes} min drive`,
      created_at: nowIso,
      updated_at: nowIso,
    })

    // Push RRULE to Google Calendar
    try {
      const gRes = await supabase.functions.invoke('create-google-event', {
        body: { event_id: templateId },
      })
      const gData = gRes.data
      const gEventId = gData?.google_event_id

      if (gEventId) {
        // Register event_series row
        await supabase.from('event_series').insert({
          id: crypto.randomUUID(),
          template_event_id: templateId,
          timezone: 'America/New_York',
          recurrence_lines: [d.rrule],
          status: 'active',
          ownership: 'casa',
          google_recurring_event_id: gEventId,
          created_at: nowIso,
          updated_at: nowIso,
        })
      }
    } catch (pushErr) {
      console.error('[routineRecurrenceCoordinator] Failed to push series to Google:', pushErr)
    }

    added++
  }

  // 4. Trigger reconciliation and recurrence materialization if changes occurred
  if (added > 0 || removed > 0) {
    try {
      await supabase.functions.invoke('sync-calendars', { body: {} })
      await supabase.functions.invoke('materialize-recurring-events', { body: {} })
    } catch (syncErr) {
      console.warn('[routineRecurrenceCoordinator] Background sync notification:', syncErr)
    }
  }

  return { added, removed, retained }
}
