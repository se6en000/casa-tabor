export interface CalendarEventSummary {
  id: string
  title: string
  start_time: string | null
  end_time: string | null
  all_day?: boolean | null
  location_name?: string | null
  description?: string | null
  category?: string | null
  source_type?: string | null
  google_event_id?: string | null
  members?: {
    id?: string
    family_member?: {
      id: string
      name: string
      color_hex?: string | null
    }
  }[]
}

export function getLocalDateStr(isoString?: string | null): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isFamilyDailyRoutineEvent(e?: CalendarEventSummary | null): boolean {
  if (!e) return false
  if (e.all_day) return false

  const title = (e.title || '').toLowerCase().trim()
  const desc = (e.description || '').toLowerCase()

  // Real medical / script / prescription / strings rehearsal / doctor / testing / flights / games are NEVER filtered
  if (
    title.includes('script') ||
    title.includes('prescription') ||
    title.includes('adderall') ||
    title.includes('medication') ||
    title.includes('pharmacy') ||
    title.includes('strings') ||
    title.includes('beethoven') ||
    title.includes('rehearsal') ||
    title.includes('assessment') ||
    title.includes('testing') ||
    title.includes('doctor') ||
    title.includes('pediatrician') ||
    title.includes('dentist') ||
    title.includes('orthodontist') ||
    title.includes('conference') ||
    title.includes('game') ||
    title.includes('tournament') ||
    title.includes('flight') ||
    title.includes('dinner') ||
    title.includes('party') ||
    title.includes('birthday') ||
    title.includes('open house')
  ) {
    return false
  }

  // Any explicit Google Calendar synced event that is not an ordinary chore is preserved
  if (e.google_event_id && !title.includes('routine') && !title.includes('chore') && !title.includes('habit')) {
    return false
  }

  const cat = (e.category || '').toLowerCase().trim()
  if (
    cat === 'routine' ||
    cat === 'school_routine' ||
    cat === 'chore' ||
    cat === 'habit' ||
    cat === 'transport' ||
    cat === 'transit'
  ) {
    return true
  }

  // School drop-off / pickup non-special routines (e.g. "Drop off Owen @ ...", "Pick up Liv @ ...")
  if (
    /^drop\s*off\b/i.test(title) ||
    /^pick\s*up\b/i.test(title) ||
    /\bdrop\s*off\b/i.test(title) ||
    /\bpick\s*up\b/i.test(title) ||
    /\bdropoff\b/i.test(title) ||
    /\bpickup\b/i.test(title) ||
    /\bschool drop-?off\b/i.test(title) ||
    /\bschool pick-?up\b/i.test(title) ||
    /\bafter school care\b/i.test(title) ||
    /\baftercare\b/i.test(title) ||
    /\bschool dismissal\b/i.test(title) ||
    /\bcarpool\b/i.test(title)
  ) {
    return true
  }

  const routinePatterns = [
    /\broutine\b/i,
    /\bmorning routine\b/i,
    /\bbedtime routine\b/i,
    /\bevening routine\b/i,
    /\bdaily routine\b/i,
    /\bdaily habit\b/i,
    /\bbrush teeth\b/i,
    /\bget dressed\b/i,
    /\bwind down\b/i,
    /\bquiet time\b/i,
    /\bwake up\b/i,
    /\bdaily chore\b/i,
    /\btrash & recycling\b/i,
    /\btake out trash\b/i,
    /\bfeed pets\b/i,
    /\bhomework time\b/i,
    /\breading time\b/i,
    /\bscreen time\b/i,
    /\bhousehold routine\b/i,
  ]

  return routinePatterns.some((p) => p.test(title) || p.test(desc))
}

export interface ProposedActionSlot {
  id: string
  title: string
  subtitle?: string
  date?: string
  displayDate?: string
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  location?: string | null
  assignedMemberName?: string | null
}

export interface DayTimelineItem {
  id: string
  title: string
  subtitle?: string
  timeRangeFormatted: string
  startIso: string | null
  endIso: string | null
  allDay: boolean
  isProposed: boolean
  hasConflictWithProposed?: boolean
  location?: string | null
  assignedMemberName?: string | null
  assignedMemberColor?: string | null
}

export interface EvaluatedDaySchedule {
  dateStr: string
  existingEventsCount: number
  isDayCompletelyClear: boolean
  hasConflict: boolean
  conflictingEvents: CalendarEventSummary[]
  timelineItems: DayTimelineItem[]
}

export function formatTimeRange(startIso?: string | null, endIso?: string | null, allDay = false): string {
  if (allDay || !startIso) return 'All Day'
  try {
    const s = new Date(startIso)
    if (isNaN(s.getTime())) return 'Scheduled Time'
    const startStr = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (!endIso) return startStr
    const e = new Date(endIso)
    if (isNaN(e.getTime())) return startStr
    const endStr = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return `${startStr} – ${endStr}`
  } catch {
    return 'Scheduled Time'
  }
}

export function detectTimeSlotConflict(
  proposedStartIso?: string | null,
  proposedEndIso?: string | null,
  existingEvent?: CalendarEventSummary
): boolean {
  if (!proposedStartIso || !existingEvent?.start_time) return false
  if (existingEvent.all_day) return false // All-day informational events do not hard-block timed appointments

  const pStart = new Date(proposedStartIso).getTime()
  const pEnd = proposedEndIso
    ? new Date(proposedEndIso).getTime()
    : pStart + 60 * 60_000 // default 1 hour if unspecified

  const eStart = new Date(existingEvent.start_time).getTime()
  const eEnd = existingEvent.end_time
    ? new Date(existingEvent.end_time).getTime()
    : eStart + 45 * 60_000

  if (isNaN(pStart) || isNaN(pEnd) || isNaN(eStart) || isNaN(eEnd)) return false

  // Overlap condition: startA < endB && endA > startB
  return pStart < eEnd && pEnd > eStart
}

export function evaluateDayScheduleWithProposedSlot(
  existingEvents: CalendarEventSummary[],
  proposedAction: ProposedActionSlot
): EvaluatedDaySchedule {
  const dateStr = proposedAction.date || getLocalDateStr(proposedAction.startTime) || new Date().toISOString().slice(0, 10)
  
  // Filter events belonging to this target day (by local date comparison), excluding vanilla routines
  const filteredEvents = (existingEvents || []).filter((e) => {
    if (!e.start_time) return false
    const eventDay = getLocalDateStr(e.start_time)
    if (eventDay !== dateStr) return false
    if (isFamilyDailyRoutineEvent(e)) return false
    return true
  })

  // Smart deduplicate redundant duplicate events with same start time and topic (e.g. Early Strings or transit repeats)
  const seenSlotTopics = new Set<string>()
  const dayEvents: CalendarEventSummary[] = []
  for (const evt of filteredEvents) {
    const sTime = evt.start_time ? evt.start_time.slice(0, 16) : ''
    const topicKey = evt.title.toLowerCase().replace(/[^a-z0-9]/g, '')
    const broadTopic = topicKey.includes('string') ? 'strings' : topicKey.includes('giselle') ? 'giselle' : topicKey.slice(0, 10)
    const slotKey = `${sTime}_${broadTopic}`
    if (seenSlotTopics.has(slotKey)) continue
    seenSlotTopics.add(slotKey)
    dayEvents.push(evt)
  }

  const conflictingEvents: CalendarEventSummary[] = []
  const timelineItems: DayTimelineItem[] = []

  // Add existing events to timeline
  for (const evt of dayEvents) {
    const isConflict = detectTimeSlotConflict(proposedAction.startTime, proposedAction.endTime, evt)
    if (isConflict) {
      conflictingEvents.push(evt)
    }

    const firstMember = evt.members?.[0]?.family_member
    timelineItems.push({
      id: evt.id,
      title: evt.title,
      subtitle: evt.description || undefined,
      timeRangeFormatted: formatTimeRange(evt.start_time, evt.end_time, !!evt.all_day),
      startIso: evt.start_time,
      endIso: evt.end_time,
      allDay: !!evt.all_day,
      isProposed: false,
      hasConflictWithProposed: isConflict,
      location: evt.location_name || undefined,
      assignedMemberName: firstMember?.name || undefined,
      assignedMemberColor: firstMember?.color_hex || undefined,
    })
  }

  // Add proposed slot
  timelineItems.push({
    id: proposedAction.id,
    title: proposedAction.title,
    subtitle: proposedAction.subtitle,
    timeRangeFormatted: formatTimeRange(proposedAction.startTime, proposedAction.endTime, !!proposedAction.allDay),
    startIso: proposedAction.startTime || null,
    endIso: proposedAction.endTime || null,
    allDay: !!proposedAction.allDay,
    isProposed: true,
    hasConflictWithProposed: conflictingEvents.length > 0,
    location: proposedAction.location || undefined,
    assignedMemberName: proposedAction.assignedMemberName || undefined,
  })

  // Sort chronologically by startIso (all-day first, then ascending start time)
  timelineItems.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    const timeA = a.startIso ? new Date(a.startIso).getTime() : 0
    const timeB = b.startIso ? new Date(b.startIso).getTime() : 0
    if (timeA !== timeB) return timeA - timeB
    // If exact same start time, put existing first
    if (a.isProposed !== b.isProposed) return a.isProposed ? 1 : -1
    return 0
  })

  return {
    dateStr,
    existingEventsCount: dayEvents.length,
    isDayCompletelyClear: dayEvents.length === 0,
    hasConflict: conflictingEvents.length > 0,
    conflictingEvents,
    timelineItems,
  }
}
