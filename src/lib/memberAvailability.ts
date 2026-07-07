import type {
  FamilyMember,
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'

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

function formatMeridiem(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, (24 * 60) - 1))
  const h24 = Math.floor(clamped / 60)
  const mins = clamped % 60
  const h12 = ((h24 + 11) % 12) + 1
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  return `${h12}:${String(mins).padStart(2, '0')} ${suffix}`
}

function zonedParts(dateValue: Date, timezone: string): { weekday: number; minutes: number } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateValue)

  const weekday = formatted.find((part) => part.type === 'weekday')?.value ?? 'Sun'
  const hour = Number.parseInt(formatted.find((part) => part.type === 'hour')?.value ?? '0', 10)
  const minute = Number.parseInt(formatted.find((part) => part.type === 'minute')?.value ?? '0', 10)

  return {
    weekday: WEEKDAY_INDEX[weekday] ?? 0,
    minutes: (hour * 60) + minute,
  }
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function ruleOverlapsWindow(rule: MemberAvailabilityRule, startAt: Date, endAt: Date): boolean {
  const tz = rule.timezone || 'America/New_York'
  const start = zonedParts(startAt, tz)
  const end = zonedParts(endAt, tz)
  const ruleStart = toMinutes(rule.start_local)
  const ruleEnd = toMinutes(rule.end_local)

  if (start.weekday === end.weekday) {
    if (start.weekday !== rule.day_of_week) return false
    return rangesOverlap(start.minutes, end.minutes, ruleStart, ruleEnd)
  }

  if (start.weekday === rule.day_of_week && rangesOverlap(start.minutes, 24 * 60, ruleStart, ruleEnd)) {
    return true
  }
  if (end.weekday === rule.day_of_week && rangesOverlap(0, end.minutes, ruleStart, ruleEnd)) {
    return true
  }
  return false
}

function exceptionsOverlappingWindow(
  exceptions: MemberAvailabilityException[],
  startAt: Date,
  endAt: Date,
): MemberAvailabilityException[] {
  const startMs = startAt.getTime()
  const endMs = endAt.getTime()
  return exceptions.filter((exception) => {
    const exStart = new Date(exception.start_at).getTime()
    const exEnd = new Date(exception.end_at).getTime()
    return exStart < endMs && exEnd > startMs
  })
}

function canDrive(member: FamilyMember): boolean {
  if (member.role === 'child') return false
  return member.can_drive ?? (member.role === 'parent' || member.role === 'caregiver')
}

export interface AvailabilityAssessment {
  available: boolean
  softUnavailable: boolean
  reason: string | null
}

export interface AvailabilityEvaluationOptions {
  requireCanDrive?: boolean
}

export function evaluateMemberAvailabilityForWindow(
  member: FamilyMember,
  startAt: Date,
  endAt: Date,
  rules: MemberAvailabilityRule[],
  exceptions: MemberAvailabilityException[],
  options?: AvailabilityEvaluationOptions,
): AvailabilityAssessment {
  const requireCanDrive = options?.requireCanDrive ?? true
  if (requireCanDrive && !canDrive(member)) {
    return { available: false, softUnavailable: false, reason: 'Cannot drive' }
  }

  const overlappingExceptions = exceptionsOverlappingWindow(exceptions, startAt, endAt)
  if (overlappingExceptions.some((exception) => exception.override_type === 'day_off' || exception.override_type === 'manual_available')) {
    return { available: true, softUnavailable: false, reason: null }
  }

  const manualBlock = overlappingExceptions.find((exception) => exception.override_type === 'manual_block')
  if (manualBlock) {
    return {
      available: false,
      softUnavailable: false,
      reason: manualBlock.note?.trim() || 'Unavailable by override',
    }
  }

  const blockingRule = rules.find((rule) => (
    rule.availability_type === 'unavailable'
    && ruleOverlapsWindow(rule, startAt, endAt)
  ))

  if (!blockingRule) {
    return { available: true, softUnavailable: false, reason: null }
  }

  const windowLabel = `${formatMeridiem(toMinutes(blockingRule.start_local))}–${formatMeridiem(toMinutes(blockingRule.end_local))}`
  const baseReason = blockingRule.reason?.trim() || `Blocked ${windowLabel}`
  if (member.availability_mode === 'open') {
    return { available: true, softUnavailable: false, reason: null }
  }
  if (member.availability_mode === 'flexible') {
    return { available: true, softUnavailable: true, reason: baseReason }
  }

  return { available: false, softUnavailable: false, reason: baseReason }
}

export function indexAvailabilityRulesByMember(rules: MemberAvailabilityRule[]): Map<string, MemberAvailabilityRule[]> {
  const map = new Map<string, MemberAvailabilityRule[]>()
  for (const rule of rules) {
    const existing = map.get(rule.member_id)
    if (existing) existing.push(rule)
    else map.set(rule.member_id, [rule])
  }
  return map
}

export function indexAvailabilityExceptionsByMember(exceptions: MemberAvailabilityException[]): Map<string, MemberAvailabilityException[]> {
  const map = new Map<string, MemberAvailabilityException[]>()
  for (const exception of exceptions) {
    const existing = map.get(exception.member_id)
    if (existing) existing.push(exception)
    else map.set(exception.member_id, [exception])
  }
  return map
}
