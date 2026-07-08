import { createClient } from 'npm:@supabase/supabase-js@2'

export interface AdminOpsScope {
  dateRangeStart?: string
  dateRangeEnd?: string
  titleFilter?: string
  memberFilter?: string[]
}

export interface ParsedAdminRequest {
  operation: 'delete' | 'add' | 'edit'
  description: string
  scope: AdminOpsScope
}

export interface ResolvedMemberScope {
  memberIds: string[]
  memberNames: string[]
  eventIds: string[]
  unmatchedTerms: string[]
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

function utcDayEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitFilterValues(raw: string): string[] {
  return raw
    .split(/\s*(?:,|and)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseDateLiteral(dateText: string): Date | null {
  const match = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
}

function parseDateScope(request: string, now: Date): Pick<AdminOpsScope, 'dateRangeStart' | 'dateRangeEnd'> {
  const scope: Pick<AdminOpsScope, 'dateRangeStart' | 'dateRangeEnd'> = {}
  const lower = request.toLowerCase()
  const nowStart = utcDayStart(now)

  const fromTodayToYearEnd = /\bfrom\s+today\s+(?:to|through|until)\s+(?:the\s+)?end\s+of\s+(?:the\s+)?year\b/i.test(request)
  if (fromTodayToYearEnd) {
    const endOfYear = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999))
    scope.dateRangeStart = nowStart.toISOString()
    scope.dateRangeEnd = endOfYear.toISOString()
    return scope
  }

  const betweenIsoRange = request.match(/\b(?:between|from)\s+(\d{4}-\d{2}-\d{2})\s+(?:and|to|through|until)\s+(\d{4}-\d{2}-\d{2})\b/i)
  if (betweenIsoRange) {
    const startDate = parseDateLiteral(betweenIsoRange[1])
    const endDate = parseDateLiteral(betweenIsoRange[2])
    if (startDate && endDate) {
      scope.dateRangeStart = utcDayStart(startDate).toISOString()
      scope.dateRangeEnd = utcDayEnd(endDate).toISOString()
      return scope
    }
  }

  const monthMatch = request.match(/\b(?:in|during)\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i)
  if (monthMatch) {
    const monthIndex = MONTH_INDEX[monthMatch[1].toLowerCase()]
    const year = monthMatch[2] ? Number(monthMatch[2]) : now.getUTCFullYear()
    if (Number.isFinite(monthIndex) && Number.isFinite(year)) {
      const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0))
      const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999))
      scope.dateRangeStart = start.toISOString()
      scope.dateRangeEnd = end.toISOString()
      return scope
    }
  }

  if (/\b(?:this|current)\s+week\b/i.test(request)) {
    const day = nowStart.getUTCDay()
    const weekStart = new Date(nowStart)
    weekStart.setUTCDate(weekStart.getUTCDate() - day)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
    scope.dateRangeStart = utcDayStart(weekStart).toISOString()
    scope.dateRangeEnd = utcDayEnd(weekEnd).toISOString()
    return scope
  }

  if (/\b(?:this|current)\s+month\b/i.test(request)) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
    scope.dateRangeStart = start.toISOString()
    scope.dateRangeEnd = end.toISOString()
    return scope
  }

  if (/\b(?:this|current)\s+year\b/i.test(request)) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999))
    scope.dateRangeStart = start.toISOString()
    scope.dateRangeEnd = end.toISOString()
    return scope
  }

  const nextDaysMatch = request.match(/\bnext\s+(\d{1,3})\s+days?\b/i)
  if (nextDaysMatch) {
    const dayCount = Number(nextDaysMatch[1])
    if (Number.isFinite(dayCount) && dayCount > 0) {
      const end = new Date(nowStart)
      end.setUTCDate(end.getUTCDate() + dayCount)
      scope.dateRangeStart = nowStart.toISOString()
      scope.dateRangeEnd = utcDayEnd(end).toISOString()
      return scope
    }
  }

  if (/\btoday\b/.test(lower)) {
    scope.dateRangeStart = nowStart.toISOString()
  }

  if (/\b(?:to|through|until)\s+(?:the\s+)?end\s+of\s+(?:the\s+)?year\b/i.test(request)) {
    scope.dateRangeEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999)).toISOString()
    if (!scope.dateRangeStart) scope.dateRangeStart = nowStart.toISOString()
  }

  return scope
}

function parseTitleFilter(request: string): string | undefined {
  const titlePatterns = [
    /['"]([^'"]{2,120})['"]/,
    /\b(?:named|titled|called)\s+['"]?([^'"\n]+?)['"]?(?=\s+(?:from|to|between|in|during|for|by)\b|$)/i,
    /\btitle\s+['"]?([^'"\n]+?)['"]?(?=\s+(?:from|to|between|in|during|for|by)\b|$)/i,
  ]

  for (const pattern of titlePatterns) {
    const match = request.match(pattern)
    if (!match) continue
    const value = match[1]?.trim()
    if (value) return value
  }
  return undefined
}

function parseMemberFilter(request: string): string[] | undefined {
  const quoted = request.match(/\b(?:for|by)\s+['"]([^'"]+)['"]/i)
  if (quoted?.[1]) {
    const values = splitFilterValues(quoted[1])
    return values.length > 0 ? values : undefined
  }

  const unquoted = request.match(
    /\b(?:for|by)\s+([a-z][a-z\s'-]{0,60}?)(?=\s+(?:from|to|between|in|during|on|at|starting|ending|until|through|title|named|called|events?|event)\b|$)/i,
  )
  if (!unquoted?.[1]) return undefined

  const values = splitFilterValues(unquoted[1])
  return values.length > 0 ? values : undefined
}

export function hasScopeFilters(scope: AdminOpsScope): boolean {
  return Boolean(
    scope.dateRangeStart ||
      scope.dateRangeEnd ||
      scope.titleFilter ||
      (scope.memberFilter && scope.memberFilter.length > 0),
  )
}

export function parseAdminOpsRequest(request: string, now = new Date()): ParsedAdminRequest {
  const lower = request.toLowerCase()
  let operation: 'delete' | 'add' | 'edit' = 'edit'

  if (/\b(delete|remove|archive|cancel)\b/.test(lower)) {
    operation = 'delete'
  } else if (/\b(add|create|schedule|insert)\b/.test(lower)) {
    operation = 'add'
  } else if (/\b(change|update|move|edit|reschedule|shift|rename|set)\b/.test(lower)) {
    operation = 'edit'
  }

  const dateScope = parseDateScope(request, now)
  const titleFilter = parseTitleFilter(request)
  const memberFilter = parseMemberFilter(request)

  return {
    operation,
    description: request.trim(),
    scope: {
      ...dateScope,
      titleFilter,
      memberFilter,
    },
  }
}

export async function resolveMemberScope(
  sb: ReturnType<typeof createClient>,
  memberFilter?: string[],
): Promise<ResolvedMemberScope | null> {
  if (!memberFilter || memberFilter.length === 0) return null

  const normalizedTerms = memberFilter.map((term) => normalizeText(term)).filter(Boolean)
  if (normalizedTerms.length === 0) return null

  const { data: members, error: membersError } = await sb
    .from('family_members')
    .select('id, name')

  if (membersError) {
    throw new Error(`Failed to resolve member filter: ${membersError.message}`)
  }

  const safeMembers = members ?? []
  const matchedIds = new Set<string>()
  const matchedNames = new Set<string>()
  const unmatchedTerms: string[] = []

  for (const term of normalizedTerms) {
    const matches = safeMembers.filter((member) => {
      const memberName = normalizeText(member.name ?? '')
      return memberName.includes(term) || term.includes(memberName)
    })
    if (matches.length === 0) {
      unmatchedTerms.push(term)
      continue
    }
    matches.forEach((member) => {
      matchedIds.add(member.id)
      matchedNames.add(member.name)
    })
  }

  const memberIds = Array.from(matchedIds)
  const memberNames = Array.from(matchedNames)
  if (memberIds.length === 0) {
    return {
      memberIds: [],
      memberNames: [],
      eventIds: [],
      unmatchedTerms,
    }
  }

  const { data: eventMembers, error: eventMembersError } = await sb
    .from('event_members')
    .select('event_id')
    .in('family_member_id', memberIds)

  if (eventMembersError) {
    throw new Error(`Failed to resolve member event scope: ${eventMembersError.message}`)
  }

  const eventIds = Array.from(new Set((eventMembers ?? []).map((row) => row.event_id).filter(Boolean)))
  return {
    memberIds,
    memberNames,
    eventIds,
    unmatchedTerms,
  }
}
