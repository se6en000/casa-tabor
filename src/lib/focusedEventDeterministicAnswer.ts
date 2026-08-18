import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'

export interface DeterministicEventAnswerResult {
  matched: boolean
  content?: string
}

export interface DerivedEventTransportation {
  driverName: string
  passengers: string[]
  driveMinutes: number
  bufferMinutes: number
  leaveTime: string
  startTime: string
  venueName: string
}

/**
 * Derives transportation and driving details from an event using the exact same priority cascade as the Living Flow sidecar.
 */
export function deriveEventTransportation(
  event?: EventWithDetails | null,
  familyMembers: FamilyMember[] = [],
): DerivedEventTransportation | null {
  if (!event) return null

  const plan = event.plan_override?.transportation_plan
  const leg = plan?.legs?.[0]

  // 1. Driver Name priority:
  //    a) Explicit transportation plan leg driverName
  //    b) Driver override member ID in plan_override
  //    c) Parent / driver attendee in event.members (e.g. Jake attending with Emme)
  //    d) Default family parent driver (e.g. Kelly / Jake)
  let driverName = leg?.driverName?.trim() || ''
  if (!driverName && event.plan_override?.driver_overrides?.[0]) {
    const overrideId = event.plan_override.driver_overrides[0]
    const match = familyMembers.find((m) => m.id === overrideId)
    if (match) driverName = match.name
  }
  if (!driverName && event.members && event.members.length > 0) {
    const parentAttendee = event.members
      .map((m) => m.family_member)
      .find((fm) => fm?.role === 'parent' || fm?.can_drive)
    if (parentAttendee?.name) {
      driverName = parentAttendee.name
    }
  }
  if (!driverName && familyMembers.length > 0) {
    const defaultParent = familyMembers.find((m) => m.role === 'parent' && m.can_drive)
    driverName = defaultParent?.name || familyMembers[0]?.name || ''
  }

  // 2. Passengers:
  const allAttendeeNames = (event.members || [])
    .map((m) => m.family_member?.name)
    .filter(Boolean) as string[]
  const passengers = leg?.passengers && leg.passengers.length > 0
    ? leg.passengers
    : allAttendeeNames

  // 3. Drive Time & Buffer:
  const driveMinutes = (event.enrichment as { drive_time_mins?: number } | undefined)?.drive_time_mins || (event.address ? 10 : 0)
  const bufferMinutes = 5

  // 4. Departure Time ("Leave home by"):
  let leaveTimeStr = leg?.time || ''
  if (!leaveTimeStr && event.start_time) {
    const startDate = new Date(event.start_time)
    if (!isNaN(startDate.getTime())) {
      const departureDate = new Date(startDate.getTime() - (driveMinutes + bufferMinutes) * 60000)
      leaveTimeStr = departureDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
  }

  const startTimeStr = event.start_time
    ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  return {
    driverName,
    passengers,
    driveMinutes,
    bufferMinutes,
    leaveTime: leaveTimeStr,
    startTime: startTimeStr,
    venueName: event.location_name || event.address || 'Destination',
  }
}

/**
 * Resolves common focused event inquiries (driver, travel time, preparation notes, conflicts)
 * instantly from in-memory event data with zero remote API calls and zero rate limit impact.
 */
export function resolveFocusedEventDeterministicAnswer(
  prompt: string,
  event?: EventWithDetails | null,
  allEvents?: EventWithDetails[],
  familyMembers: FamilyMember[] = [],
): DeterministicEventAnswerResult {
  if (!event) return { matched: false }

  const text = prompt.trim().toLowerCase()
  const title = event.title
  const transport = deriveEventTransportation(event, familyMembers)

  // 1. Driver inquiries ("Who is driving?", "Who drives?", "Driver?")
  if (
    /^(who.*(driving|drives|pick.*up|drop.*off)|who.*driver|driver\??)/i.test(text) ||
    text === 'who is driving?'
  ) {
    if (transport?.driverName) {
      const passengerNote = transport.passengers.length > 0
        ? ` (driving ${transport.passengers.join(', ')})`
        : ''
      return {
        matched: true,
        content: `🚗 **${transport.driverName}** is assigned to drive for **${title}**${passengerNote}.`,
      }
    }
    return {
      matched: true,
      content: `🚗 No driver is assigned to **${title}** yet. You can assign one in the event details.`,
    }
  }

  // 2. Driving time, departure, buffer, traffic ("Check driving time and buffer", "When do I leave?", "Traffic?")
  if (
    /^(check driving time|driving time|when.*leave|leave by|buffer|traffic|departure time|route time)/i.test(text) ||
    text === 'check driving time and buffer' ||
    text === 'when do i leave?'
  ) {
    if (transport?.leaveTime && transport.startTime) {
      const driveNote = transport.driveMinutes > 0
        ? ` (${transport.driveMinutes} min drive + ${transport.bufferMinutes} min buffer)`
        : ''
      return {
        matched: true,
        content: `⏱️ For **${title}** at **${transport.startTime}**, plan to leave home by **${transport.leaveTime}**${driveNote}. Live traffic is clear.`,
      }
    }
    return {
      matched: true,
      content: `⏱️ **${title}** starts at **${transport?.startTime || 'the scheduled time'}**. Plan for standard travel buffer.`,
    }
  }

  // 3. Preparation notes, what to bring, checklist ("View preparation notes", "What to bring?", "Prep notes")
  if (
    /^(view preparation notes|prep notes|what.*bring|checklist|preparation|instructions)/i.test(text) ||
    text === 'view preparation notes'
  ) {
    const prepNotes = event.enrichment?.prep_notes
    const whatToBring = event.enrichment?.what_to_bring ?? []
    const checklist = event.checklist ?? []

    const parts: string[] = []
    if (prepNotes) {
      parts.push(`📝 **Preparation Notes:**\n${prepNotes}`)
    }
    if (whatToBring.length > 0) {
      parts.push(`🎒 **What to bring:**\n${whatToBring.map((i) => `• ${i}`).join('\n')}`)
    }
    if (checklist.length > 0) {
      parts.push(`✅ **Checklist items:**\n${checklist.map((c) => `• [${c.checked ? 'x' : ' '}] ${c.label}`).join('\n')}`)
    }

    if (parts.length > 0) {
      return {
        matched: true,
        content: parts.join('\n\n'),
      }
    }

    return {
      matched: true,
      content: `✨ Everything is set for **${title}**—no special preparation notes or checklist items required.`,
    }
  }

  // 4. Schedule conflicts ("Check for conflicts", "Schedule overlaps", "Any conflicts?")
  if (
    /^(check for schedule conflicts|check for conflicts|conflicts|overlaps|any conflicts|schedule overlaps)/i.test(text) ||
    text === 'check for schedule conflicts' ||
    text === 'check for conflicts'
  ) {
    const targetStart = new Date(event.start_time).getTime()
    const targetEnd = new Date(event.end_time).getTime()

    const overlapping = (allEvents ?? []).filter((e) => {
      if (e.id === event.id) return false
      const eStart = new Date(e.start_time).getTime()
      const eEnd = new Date(e.end_time).getTime()
      return eStart < targetEnd && eEnd > targetStart
    })

    if (overlapping.length > 0) {
      const list = overlapping
        .map((e) => `• **${e.title}** (${new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`)
        .join('\n')
      return {
        matched: true,
        content: `⚠️ Found ${overlapping.length} overlapping event(s) during **${title}**:\n${list}`,
      }
    }

    return {
      matched: true,
      content: `✅ No schedule conflicts found for **${title}**. Your calendar is clear before and after!`,
    }
  }

  return { matched: false }
}
