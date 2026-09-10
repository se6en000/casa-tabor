import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'

export function getGoingMembers(event: EventWithDetails): FamilyMember[] {
  const selected = (event.members ?? [])
    .filter((member) => {
      const role = member?.role?.toLowerCase() ?? ''
      return role === 'attendee' || role === 'assignee' || role === 'primary'
    })
    .map((member) => member?.family_member)
    .filter((member): member is FamilyMember => Boolean(member))

  const deduped = new Map(selected.map((member) => [member.id, member]))
  return Array.from(deduped.values()).sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''))
}

export function deriveResponsibilityChip(event: EventWithDetails, household: FamilyMember[]) {
  const responsibility = deriveCalendarCardResponsibility(event, household, new Date())
  if (!responsibility.responsible) return null
  return {
    label: responsibility.roleBadge === 'supervise' ? 'SUPERVISOR' : 'DRIVER',
    person: responsibility.responsible,
  }
}
