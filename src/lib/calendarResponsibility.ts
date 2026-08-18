import type { EventWithDetails } from '../hooks/useCalendarEvents.ts'
import type { FamilyMember } from '../types'
import {
  getPersistedPlanOverrides,
  resolveEventMode,
} from './eventPlanOverrides.ts'
import { derivePlan, type DerivedPerson } from './eventCommandCenter.ts'
import { projectHomeTransportation } from './homeTransportationProjection.mjs'

const SHARED_GOLD = 'var(--color-casa-gold)'

type ResponsibilityRoleBadge = 'drive' | 'supervise'

export type CalendarCardResponsibility = {
  responsible: DerivedPerson | null
  attendees: EventWithDetails['members']
  summary: string
  roleBadge: ResponsibilityRoleBadge
}

function fallbackResponsiblePerson(event: EventWithDetails): DerivedPerson | null {
  const fallbackMember = event.members.find((member) => member.role === 'primary')?.family_member
    ?? event.members[0]?.family_member
    ?? null
  if (!fallbackMember) return null
  return {
    id: fallbackMember.id,
    name: fallbackMember.name,
    initial: fallbackMember.name?.[0]?.toUpperCase() ?? '?',
    color: fallbackMember.color_hex ?? SHARED_GOLD,
    role: fallbackMember.role,
  }
}

function toDerivedPersonFromMember(member: FamilyMember | undefined | null): DerivedPerson | null {
  if (!member) return null
  return {
    id: member.id,
    name: member.name,
    initial: member.name?.[0]?.toUpperCase() ?? '?',
    color: member.color_hex ?? SHARED_GOLD,
    role: member.role,
  }
}

function projectedDriverPerson(
  driver: { id: string; name: string } | null | undefined,
  household: FamilyMember[],
): DerivedPerson | null {
  if (!driver) return null
  const member = household.find((candidate) => candidate.id === driver.id)
    ?? household.find((candidate) => candidate.name.toLowerCase() === driver.name.toLowerCase())
  return member
    ? toDerivedPersonFromMember(member)
    : {
        id: driver.id,
        name: driver.name,
        initial: driver.name[0]?.toUpperCase() ?? '?',
        color: 'var(--color-casa-navy)',
      }
}

function applyPersistedDriverOverrides(
  event: EventWithDetails,
  legs: ReturnType<typeof derivePlan>['legs'],
  household: FamilyMember[],
  driverOverrides: Record<number, string>,
  waitsOverride: boolean | null,
) {
  const attendeeById = new Map(event.members.map((member) => [member.family_member.id, member.family_member]))
  const householdById = new Map(household.map((member) => [member.id, member]))
  const withDriverOverrides = legs.map((leg, index) => {
    const overrideDriverId = driverOverrides[index]
    if (!overrideDriverId || !leg.driver) return leg
    const familyMember = attendeeById.get(overrideDriverId) ?? householdById.get(overrideDriverId)
    const overrideDriver = toDerivedPersonFromMember(familyMember)
    return overrideDriver ? { ...leg, driver: overrideDriver } : leg
  })
  const waits = waitsOverride ?? Boolean(withDriverOverrides.find((leg) => leg.kind === 'stay')?.waits)
  return withDriverOverrides.map((leg) => {
    if (leg.kind !== 'stay') return leg
    if (!waits) return { ...leg, waits: false }
    const driveLeg = withDriverOverrides.find((item) => item.kind === 'drop' || item.kind === 'depart')
    return { ...leg, waits: true, title: `${driveLeg?.driver?.name ?? 'Driver'} waits on site` }
  })
}

export function deriveCalendarCardResponsibility(
  event: EventWithDetails,
  household: FamilyMember[],
  now: Date,
): CalendarCardResponsibility {
  const mode = resolveEventMode(event)
  const persisted = getPersistedPlanOverrides(event)
  if (persisted.transportationPlan && Array.isArray(persisted.transportationPlan.legs) && persisted.transportationPlan.legs.length === 0) {
    return {
      responsible: null,
      attendees: event.members ?? [],
      summary: '',
      roleBadge: 'drive',
    }
  }
  const explicit = projectHomeTransportation(event, persisted.transportationPlan, now)
  if (explicit) {
    const drivers = explicit.drivers
      .map((driver) => projectedDriverPerson(driver, household))
      .filter((driver): driver is DerivedPerson => driver !== null)
    const responsible = projectedDriverPerson(explicit.nextDriver, household)
      ?? drivers[0]
      ?? fallbackResponsiblePerson(event)
    const driverIds = new Set(drivers.map((driver) => driver.id))
    const driverNames = new Set(drivers.map((driver) => driver.name.toLowerCase()))
    const attendees = event.members.filter((member) => (
      !driverIds.has(member.family_member.id) &&
      !driverNames.has(member.family_member.name.toLowerCase())
    ))
    return {
      responsible,
      attendees: attendees.length > 0 ? attendees : event.members,
      summary: explicit.summary,
      roleBadge: mode === 'hosted' ? 'supervise' : 'drive',
    }
  }

  const plan = derivePlan(event, mode, { household })
  const effectiveLegs = applyPersistedDriverOverrides(
    event,
    plan.legs,
    household,
    persisted.driverOverrides ?? {},
    persisted.waits ?? null,
  )
  const transportLeg = effectiveLegs.find((leg) =>
    leg.kind === 'drop' || leg.kind === 'depart' || leg.kind === 'pickup' || leg.kind === 'return',
  )
  const firstDriverLeg = transportLeg ?? effectiveLegs.find((leg) => leg.driver)
  const responsible = firstDriverLeg?.driver ?? fallbackResponsiblePerson(event)
  const attendees = (() => {
    if (!responsible) return event.members
    const withoutResponsible = event.members.filter((member) => member.family_member.id !== responsible.id)
    return withoutResponsible.length > 0 ? withoutResponsible : event.members
  })()
  const name = responsible?.name ?? (mode === 'hosted' ? 'Caregiver' : 'Driver')
  const stayLeg = effectiveLegs.find((leg) => leg.kind === 'stay')
  const hasDropOrDepart = effectiveLegs.some((leg) => leg.kind === 'drop' || leg.kind === 'depart')
  const hasPickupOrReturn = effectiveLegs.some((leg) => leg.kind === 'pickup' || leg.kind === 'return')
  const summary = mode === 'hosted'
    ? `${name} supervising`
    : stayLeg?.waits
      ? `${name} drives & stays`
      : hasDropOrDepart && hasPickupOrReturn
        ? `${name} drives`
        : hasDropOrDepart
          ? `${name} drops off`
          : hasPickupOrReturn
            ? `${name} picks up`
            : `${name} drives`
  return {
    responsible,
    attendees,
    summary,
    roleBadge: mode === 'hosted' ? 'supervise' : 'drive',
  }
}
