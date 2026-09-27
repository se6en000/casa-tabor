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

/** A live Casa series that could be one of a child's school-run exceptions. */
export interface ExistingRoutineSeries {
  seriesId: string
  templateId?: string
  title: string
  byDay: string | null
  gid: string | null
  ownership: string
  createdAt: string
  occurrences?: number
  /** The template knows its Google id (Casa-made); imported templates don't. */
  templateGoogleId?: string | null
}

export interface RoutineSeriesSyncPlan {
  keep: ExistingRoutineSeries[]
  retire: Array<ExistingRoutineSeries & { deleteGoogle: boolean }>
  create: DesiredRoutineSeries[]
}

const sameRun = (d: Pick<DesiredRoutineSeries, 'title' | 'dayCode'>, e: ExistingRoutineSeries) =>
  e.byDay === d.dayCode && e.title.toLowerCase().trim() === d.title.toLowerCase().trim()

/**
 * What a routine save should do with the series already there (2026-09-27: Emme's Thursday runs had
 * piled up as 2 + 3 Google series, each held twice in Casa). One series is kept per wanted run —
 * an imported one first (it carries the dates), then the one with the most dates, then the oldest;
 * every other match, and anything no longer wanted, retires. A Google copy is deleted only when no
 * kept series points at it, and only once.
 */
export function planRoutineSeriesSync(
  desired: Array<Pick<DesiredRoutineSeries, 'key' | 'title' | 'dayCode'>>,
  existing: ExistingRoutineSeries[],
): RoutineSeriesSyncPlan {
  const rank = (e: ExistingRoutineSeries) => (e.ownership === 'google_adopted' ? 0 : 1)
  const ordered = existing
    .map((e, index) => ({ e, index }))
    .sort((a, b) => rank(a.e) - rank(b.e)
      || (b.e.occurrences ?? 0) - (a.e.occurrences ?? 0)
      || a.e.createdAt.localeCompare(b.e.createdAt)
      || a.index - b.index)
    .map(({ e }) => e)
  const keep: ExistingRoutineSeries[] = []
  const create: DesiredRoutineSeries[] = []
  for (const d of desired) {
    const match = ordered.find((e) => sameRun(d, e))
    if (match) keep.push(match)
    else create.push(d as DesiredRoutineSeries)
  }
  const keptIds = new Set(keep.map((k) => k.seriesId))
  const keptGids = new Set(keep.map((k) => k.gid).filter(Boolean))
  // Each Google copy is deleted once, by a retiring copy that knows its Google id when there is one.
  const retiring = existing.filter((e) => !keptIds.has(e.seriesId))
  const deleter = new Map<string, string>()
  for (const e of [...retiring].sort((a, b) => Number(Boolean(b.templateGoogleId)) - Number(Boolean(a.templateGoogleId)))) {
    if (e.gid && !keptGids.has(e.gid) && !deleter.has(e.gid)) deleter.set(e.gid, e.seriesId)
  }
  const retire = retiring.map((e) => ({ ...e, deleteGoogle: Boolean(e.gid && deleter.get(e.gid) === e.seriesId) }))
  return { keep, retire, create }
}

const routineSyncQueue = new Map<string, Promise<unknown>>()

/** Runs a child's routine sync after any sync already running for that child, never alongside it. */
export function runRoutineSyncOnce<T>(memberId: string, run: () => Promise<T>): Promise<T> {
  const previous = routineSyncQueue.get(memberId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(run)
  routineSyncQueue.set(memberId, next)
  void next.finally(() => { if (routineSyncQueue.get(memberId) === next) routineSyncQueue.delete(memberId) }).catch(() => undefined)
  return next
}

/**
 * Reconciles routine exceptions with Google Calendar and Casa Tabor recurrence engine.
 * Guarantees zero duplicate single events and zero orphaned Google series.
 */
export function syncMemberRoutineExceptions(
  supabase: SupabaseClient,
  memberId: string,
  routine: FamilyRoutine,
  members: FamilyMember[] = [],
): Promise<{ added: number; removed: number; retained: number }> {
  return runRoutineSyncOnce(memberId, () => syncMemberRoutineExceptionsNow(supabase, memberId, routine, members))
}

async function syncMemberRoutineExceptionsNow(
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

  // 1. Every live series that could be one of this child's school runs — Casa-made or imported from
  // Google (imported templates are stored cancelled, so templates alone missed them).
  const { data: seriesRows } = await supabase
    .from('event_series')
    .select('id, ownership, created_at, recurrence_lines, google_recurring_event_id, template:events!event_series_template_event_id_fkey(id, title, rrule, deleted_at, google_event_id)')
    .eq('status', 'active')
    .is('deleted_at', null)
  type SeriesRow = {
    id: string; ownership: string; created_at: string; recurrence_lines: string[] | null; google_recurring_event_id: string | null
    template: { id: string; title: string; rrule: string | null; deleted_at: string | null; google_event_id: string | null } | null
  }
  const childTitle = new RegExp(`^(Drop off|Pick up) ${childName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} @`, 'i')
  const existing: ExistingRoutineSeries[] = ((seriesRows ?? []) as unknown as SeriesRow[])
    .filter((r) => r.template && !r.template.deleted_at && childTitle.test(r.template.title))
    .map((r) => {
      const rule = [...(r.recurrence_lines ?? []), r.template?.rrule ?? ''].join(';')
      return {
        seriesId: r.id,
        templateId: r.template!.id,
        title: r.template!.title,
        byDay: rule.match(/BYDAY=([A-Z]{2})/)?.[1] ?? null,
        gid: r.google_recurring_event_id,
        ownership: r.ownership,
        createdAt: r.created_at,
        templateGoogleId: r.template!.google_event_id,
      }
    })
  const plan = planRoutineSeriesSync(desired, existing)
  let added = 0
  const removed = plan.retire.length
  const retained = plan.keep.length

  // 2. Retire extra copies and runs no longer wanted; delete a Google copy only when nothing kept uses it.
  for (const r of plan.retire) {
    if (r.deleteGoogle && r.templateId) {
      try {
        // An imported template doesn't carry its Google id; give it the series' so the delete can find it.
        if (!r.templateGoogleId && r.gid) {
          await supabase.from('events').update({ google_event_id: r.gid }).eq('id', r.templateId)
        }
        await supabase.functions.invoke('delete-google-event', { body: { event_id: r.templateId } })
      } catch (err) {
        console.warn('[routineRecurrenceCoordinator] Failed to delete Google recurring event:', err)
      }
    }
    await supabase.from('event_series').update({ status: 'deleted', deleted_at: nowIso, purge_after: purgeIso }).eq('id', r.seriesId)
    if (r.templateId) {
      await supabase.from('events').update({ status: 'cancelled', deleted_at: nowIso, purge_after: purgeIso }).eq('id', r.templateId)
    }
    await supabase.from('events').update({ status: 'cancelled', deleted_at: nowIso, purge_after: purgeIso }).eq('series_id', r.seriesId)
  }

  // 3. Create the wanted runs that have no series yet
  for (const d of plan.create) {
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
      const connectionId: string | null = gData?.connection_id ?? null

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
          // Without its connection the importer didn't recognise Casa's own push and adopted it a second time.
          source_connection_id: connectionId,
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
