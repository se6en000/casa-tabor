import type { WallEvent, WallMember } from './engine/types'
import { celebrationHonorees } from './surprise.ts'

// Who may see what (P4.6 "Keep from…", P4.7 each person's lens). The wall is seen by
// everyone in the house; a phone by its person. One rule set, used by both, so an event
// kept from Kelly can't slip onto the wall or her phone through some other list.

/** Settings key: event id → the members it is kept from. No schema change (like `wall_trip_state`). */
export const KEEP_FROM_SETTINGS_KEY = 'family_keep_from'

export type KeepFrom = Record<string, string[]>

export type Audience = { kind: 'wall' } | { kind: 'member'; memberId: string }

export function keptFrom(keep: KeepFrom | null | undefined, eventId: string): string[] {
  return keep?.[eventId] ?? []
}

export function withKeptFrom(keep: KeepFrom, eventId: string, memberIds: string[]): KeepFrom {
  const next = { ...keep }
  if (memberIds.length === 0) delete next[eventId]
  else next[eventId] = [...new Set(memberIds)]
  return next
}

type EventLike = Pick<WallEvent, 'id'> & { members?: WallEvent['members']; plan_override?: WallEvent['plan_override'] }
type MemberLike = Pick<WallMember, 'id' | 'role'> & { show_on_home_sidebar?: boolean | null }

const peopleOn = (e: EventLike) => (e.members ?? []).map((m) => m.family_member_id ?? m.family_member?.id).filter((id): id is string => Boolean(id))

/** The children the family's lanes show (not "Tabor Family" or a pet). */
const kidIds = (members: MemberLike[]) => new Set(members.filter((m) => m.role === 'child' && m.show_on_home_sidebar !== false).map((m) => m.id))

function drives(e: EventLike, memberId: string): boolean {
  const legs = (e.plan_override?.transportation_plan as { legs?: Array<{ driverId?: string | null }> } | null | undefined)?.legs ?? []
  return legs.some((leg) => leg?.driverId === memberId)
}

/**
 * The events an audience may see. The wall: nothing kept from anyone. A person: nothing
 * kept from them. A caregiver (Giselle): only what involves the kids, what she's on, and
 * what she drives — not Jake's and Kelly's own things.
 */
export function eventsFor<T extends EventLike>(audience: Audience, events: T[], members: MemberLike[], keep: KeepFrom | null | undefined): T[] {
  if (audience.kind === 'wall') return events.filter((e) => keptFrom(keep, e.id).length === 0)
  const { memberId } = audience
  const visible = events.filter((e) => !keptFrom(keep, e.id).includes(memberId))
  if (members.find((m) => m.id === memberId)?.role !== 'caregiver') return visible
  const kids = kidIds(members)
  return visible.filter((e) => {
    const people = peopleOn(e)
    return people.some((id) => kids.has(id)) || people.includes(memberId) || drives(e, memberId)
  })
}

/** Routines (school runs) an audience may see: a caregiver gets the kids' and her own. */
export function routinesFor<T extends { memberId: string }>(audience: Audience, routines: T[], members: MemberLike[]): T[] {
  if (audience.kind === 'wall') return routines
  if (members.find((m) => m.id === audience.memberId)?.role !== 'caregiver') return routines
  const kids = kidIds(members)
  return routines.filter((r) => kids.has(r.memberId) || r.memberId === audience.memberId)
}

/** Who a celebration's title suggests keeping it from, until someone has chosen. */
export function keepFromSuggestion(event: { id: string; title: string }, members: Array<{ id: string; name: string }>, keep: KeepFrom | null | undefined): string[] {
  if (keptFrom(keep, event.id).length > 0) return []
  return celebrationHonorees(event.title, members)
}
