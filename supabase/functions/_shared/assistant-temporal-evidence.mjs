const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = new Map([
  ['january', 1], ['jan', 1],
  ['february', 2], ['feb', 2],
  ['march', 3], ['mar', 3],
  ['april', 4], ['apr', 4],
  ['may', 5],
  ['june', 6], ['jun', 6],
  ['july', 7], ['jul', 7],
  ['august', 8], ['aug', 8],
  ['september', 9], ['sep', 9], ['sept', 9],
  ['october', 10], ['oct', 10],
  ['november', 11], ['nov', 11],
  ['december', 12], ['dec', 12],
])

// Weekday names and today/tomorrow/tonight are a small, closed vocabulary --
// unlike free-form phrasing, this is exactly the kind of bounded problem a
// deterministic edit-distance check can solve safely, rather than a general
// spell-checker. Words this short are excluded because the collision risk with
// unrelated real words grows as the word gets shorter and less distinctive.
const FUZZY_TEMPORAL_TOKENS = [...WEEKDAYS, 'today', 'tomorrow', 'tonight']
// Real English words close enough (by edit distance) to one of the tokens above
// to risk a false match -- e.g. "night" is two edits from "tonight" (a common
// word, not a typo of it), "fridge" from "friday". Found via a systematic sweep
// of plausible collisions, not just the cases hit by testing; if a new false
// positive turns up in practice, add it here rather than tightening the
// distance thresholds globally (which would also break real typo corrections).
const TEMPORAL_TYPO_EXCLUSIONS = new Set([
  'sundry', 'night', 'money', 'sunny', 'morrow', 'moody', 'fridge', 'sandy', 'funday',
])

function levenshteinDistance(a, b) {
  if (a === b) return 0
  const rows = a.length + 1
  const cols = b.length + 1
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[rows - 1][cols - 1]
}

function maxAllowedTypoDistance(tokenLength) {
  return tokenLength <= 5 ? 1 : 2
}

function correctTemporalTypos(text) {
  return text.replace(/\b[a-zA-Z]+\b/g, (word) => {
    const lower = word.toLowerCase()
    if (lower.length < 4 || FUZZY_TEMPORAL_TOKENS.includes(lower) || TEMPORAL_TYPO_EXCLUSIONS.has(lower)) {
      return word
    }
    let bestToken = null
    let bestDistance = Infinity
    for (const token of FUZZY_TEMPORAL_TOKENS) {
      if (Math.abs(token.length - lower.length) > 2) continue
      const distance = levenshteinDistance(lower, token)
      if (distance < bestDistance) {
        bestDistance = distance
        bestToken = token
      }
    }
    return bestToken && bestDistance <= maxAllowedTypoDistance(bestToken.length) ? bestToken : word
  })
}

function offsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return (match[1] === '+' ? 1 : -1) * minutes
}

function localDateParts(date, utcOffset) {
  const shifted = new Date(date.getTime() + offsetMinutes(utcOffset) * 60000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateAfter(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function inferYear(month, day, nowParts, explicitYear) {
  if (explicitYear) return Number(explicitYear)
  return month < nowParts.month || (month === nowParts.month && day < nowParts.day)
    ? nowParts.year + 1
    : nowParts.year
}

function exactRange(text, nowParts) {
  const isoRange = text.match(/\b(20\d{2}-\d{2}-\d{2})\s*(?:through|thru|to|-)\s*(20\d{2}-\d{2}-\d{2})\b/i)
  if (isoRange) return { start: isoRange[1], end: isoRange[2], kind: 'explicit_range' }

  const numericRange = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s*(?:through|thru|to|-)\s*(?:(\d{1,2})\/)?(\d{1,2})(?:\/(20\d{2}))?\b/i)
  if (numericRange) {
    const startMonth = Number(numericRange[1])
    const startDay = Number(numericRange[2])
    const endMonth = Number(numericRange[4] ?? numericRange[1])
    const endDay = Number(numericRange[5])
    const explicitYear = numericRange[6] ?? numericRange[3]
    const startYear = inferYear(startMonth, startDay, nowParts, numericRange[3] ?? explicitYear)
    let endYear = inferYear(endMonth, endDay, nowParts, explicitYear)
    if (endMonth < startMonth && !explicitYear) endYear = startYear + 1
    const start = isoDate(startYear, startMonth, startDay)
    const end = isoDate(endYear, endMonth, endDay)
    if (start && end) return { start, end, kind: 'explicit_range' }
  }

  const monthPattern = [...MONTHS.keys()].join('|')
  const namedRange = text.match(new RegExp(
    `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:through|thru|to|[-–])\\s*(?:(${monthPattern})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i',
  ))
  if (namedRange) {
    const startMonth = MONTHS.get(namedRange[1].toLowerCase())
    const endMonth = namedRange[3] ? MONTHS.get(namedRange[3].toLowerCase()) : startMonth
    const startDay = Number(namedRange[2])
    const endDay = Number(namedRange[4])
    const startYear = inferYear(startMonth, startDay, nowParts, namedRange[5])
    const endYear = endMonth < startMonth && !namedRange[5] ? startYear + 1 : startYear
    const start = isoDate(startYear, startMonth, startDay)
    const end = isoDate(endYear, endMonth, endDay)
    if (start && end) return { start, end, kind: 'explicit_range' }
  }

  const isoSingle = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoSingle) return { start: isoSingle[1], end: isoSingle[1], kind: 'explicit_date' }

  const numericSingle = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/)
  if (numericSingle) {
    const month = Number(numericSingle[1])
    const day = Number(numericSingle[2])
    const date = isoDate(inferYear(month, day, nowParts, numericSingle[3]), month, day)
    if (date) return { start: date, end: date, kind: 'explicit_date' }
  }

  const namedSingle = text.match(new RegExp(
    `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i',
  ))
  if (namedSingle) {
    const month = MONTHS.get(namedSingle[1].toLowerCase())
    const day = Number(namedSingle[2])
    const date = isoDate(inferYear(month, day, nowParts, namedSingle[3]), month, day)
    if (date) return { start: date, end: date, kind: 'explicit_date' }
  }
  return null
}

function relativeRange(text, nowParts) {
  const today = isoDate(nowParts.year, nowParts.month, nowParts.day)
  if (
    /\btoday\b/i.test(text) ||
    /\b(?:this\s+(?:morning|afternoon|evening)|tonight)\b/i.test(text)
  ) return { start: today, end: today }
  if (/\btomorrow\b/i.test(text)) {
    const tomorrow = dateAfter(today, 1)
    return { start: tomorrow, end: tomorrow }
  }

  const daysFromNow = text.match(/\b(one|two|three|four|five|six|seven|\d+)\s+days?\s+from\s+now\b/i)
  if (daysFromNow) {
    const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
    const days = numberWords[daysFromNow[1].toLowerCase()] ?? Number(daysFromNow[1])
    const date = dateAfter(today, days)
    return { start: date, end: date }
  }

  const weekend = text.match(/\b(this|next)\s+weekend\b/i)
  if (weekend) {
    let daysAhead = 6 - nowParts.weekday
    if (daysAhead < 0) daysAhead += 7
    if (weekend[1]?.toLowerCase() === 'next') daysAhead += 7
    const start = dateAfter(today, daysAhead)
    return { start, end: dateAfter(start, 1) }
  }

  const weekdayPattern = WEEKDAYS.join('|')
  const weekdayRangeMatch = text.match(new RegExp(
    `\\b(?:from\\s+)?(this\\s+|next\\s+)?(${weekdayPattern})\\b.*?\\b(?:through|thru|to|[-–])\\s*(?:(this|next)\\s+)?(${weekdayPattern})\\b`,
    'i',
  ))
  if (weekdayRangeMatch) {
    const startWd = WEEKDAYS.indexOf(weekdayRangeMatch[2].toLowerCase())
    const endWd = WEEKDAYS.indexOf(weekdayRangeMatch[4].toLowerCase())
    if (startWd >= 0 && endWd >= 0) {
      let startDaysAhead = startWd - nowParts.weekday
      if (startDaysAhead <= 0) startDaysAhead += 7
      if (weekdayRangeMatch[1]?.toLowerCase() === 'next') startDaysAhead += 7
      const start = dateAfter(today, startDaysAhead)
      let spanDays = endWd - startWd
      if (spanDays <= 0) spanDays += 7
      if (weekdayRangeMatch[3]?.toLowerCase() === 'next') spanDays += 7
      const end = dateAfter(start, spanDays)
      return { start, end }
    }
  }

  const weekday = WEEKDAYS.findIndex((day) => new RegExp(`\\b(?:this\\s+|next\\s+)?${day}\\b`, 'i').test(text))
  if (weekday >= 0) {
    const modifier = text.match(new RegExp(`\\b(this|next)\\s+${WEEKDAYS[weekday]}\\b`, 'i'))?.[1]?.toLowerCase()
    let daysAhead = weekday - nowParts.weekday
    if (daysAhead <= 0) daysAhead += 7
    if (modifier === 'next') daysAhead += 7
    const date = dateAfter(today, daysAhead)
    return { start: date, end: date }
  }

  // Checked last, deliberately: a mealtime/bedtime word only means "today" when
  // there's no more specific day reference elsewhere in the message. Checking
  // this first (as the code used to) meant "Saturday at noon" silently ignored
  // "Saturday" and resolved to today, even with correct spelling -- unrelated to
  // and found alongside the typo-tolerance fix above.
  if (/\b(?:at|around)\s+(?:lunch(?:time)?|noon|midday|dinner(?:time)?|bedtime)\b/i.test(text)) {
    return { start: today, end: today }
  }

  return null
}

export function extractUserTemporalEvidence(message, options = {}) {
  if (message?.role !== 'user' || typeof message.content !== 'string') return null
  const text = message.content.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const matchText = correctTemporalTypos(text)
  const now = options.now instanceof Date ? options.now : new Date()
  const nowParts = localDateParts(now, options.utcOffset)
  const exact = exactRange(matchText, nowParts)
  const resolved = exact ?? relativeRange(matchText, nowParts)
  if (!resolved) return null
  return {
    sourceMessageId: typeof message.id === 'string' ? message.id : null,
    sourceText: text,
    rangeStart: resolved.start,
    rangeEnd: resolved.end,
    resolutionKind: exact?.kind ?? 'relative',
    requiresExactDateConfirmation: !exact || resolved.start !== resolved.end,
  }
}

function proposedLocalDate(value, utcOffset) {
  const timestamp = Date.parse(String(value ?? ''))
  if (!Number.isFinite(timestamp)) return null
  const embeddedOffset = String(value ?? '').match(/([+-]\d{2}:\d{2})$/)?.[1]
  const parts = localDateParts(new Date(timestamp), utcOffset ?? embeddedOffset)
  return isoDate(parts.year, parts.month, parts.day)
}

export function classifyCalendarTemporalEvidence(messages, proposed, options = {}) {
  const evidenceRows = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .map((message) => extractUserTemporalEvidence(message, options))
    .filter(Boolean)
  if (evidenceRows.length === 0) {
    return {
      allowed: false,
      status: 'missing',
      sourceMessageId: null,
      sourceText: null,
      rangeStart: null,
      rangeEnd: null,
      resolutionKind: 'missing',
      requiresExactDateConfirmation: true,
    }
  }

  const startDate = proposedLocalDate(proposed?.start, options.utcOffset)
  const endDate = proposedLocalDate(proposed?.end, options.utcOffset)
  const matchesEvidence = (evidence) => Boolean(
    startDate &&
    endDate &&
    startDate >= evidence.rangeStart &&
    startDate <= evidence.rangeEnd &&
    endDate >= evidence.rangeStart &&
    endDate <= dateAfter(evidence.rangeEnd, 1)
  )
  const newest = evidenceRows[0]
  const evidence = newest.resolutionKind.startsWith('explicit')
    ? newest
    : evidenceRows.find((candidate) => candidate.resolutionKind.startsWith('explicit') && matchesEvidence(candidate)) ?? newest
  const matches = Boolean(
    matchesEvidence(evidence),
  )
  return {
    ...evidence,
    allowed: matches,
    status: matches ? 'grounded' : 'mismatch',
  }
}

function shiftIsoDateOnly(isoTimestamp, days) {
  const match = String(isoTimestamp ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(T.*)$/)
  if (!match) return null
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  const yyyy = String(shifted.getUTCFullYear()).padStart(4, '0')
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}${match[4]}`
}

// classifyCalendarTemporalEvidence only validates that a proposed create's DATE is
// grounded in something the user said -- it doesn't check the resulting timestamp
// is still in the future. A relative resolution ("today", "this Tuesday" said on
// an actual Tuesday, "this morning") can land in the past once the specific time
// of day has already gone by (e.g. "call the bank today at 8am" asked at 7pm),
// producing a grounded-but-already-past create. Roll that forward by one day.
// Deliberately scoped to resolutionKind 'relative' only: an explicitly-typed past
// date ("September 5th") might be intentionally historical (backfilling a record)
// rather than a mistake, so it's left alone.
export function resolvePastRelativeCreateRollover(proposed, evidence, options = {}) {
  if (evidence?.resolutionKind !== 'relative') return null
  const now = options.now instanceof Date ? options.now : new Date()
  const startStr = typeof proposed?.start === 'string'
    ? proposed.start
    : typeof proposed?.start_time === 'string' ? proposed.start_time : null
  const endStr = typeof proposed?.end === 'string'
    ? proposed.end
    : typeof proposed?.end_time === 'string' ? proposed.end_time : null
  const startMs = startStr ? Date.parse(startStr) : NaN
  if (!Number.isFinite(startMs) || startMs >= now.getTime()) return null
  const rolledStart = shiftIsoDateOnly(startStr, 1)
  if (!rolledStart) return null
  const rolledEnd = endStr ? shiftIsoDateOnly(endStr, 1) : null
  return { start: rolledStart, end: rolledEnd ?? null }
}

export function validateCalendarTemporalProvenance(provenance, proposed, options = {}) {
  if (
    !provenance ||
    typeof provenance !== 'object' ||
    typeof provenance.rangeStart !== 'string' ||
    typeof provenance.rangeEnd !== 'string' ||
    typeof provenance.sourceText !== 'string' ||
    !['explicit_date', 'explicit_range', 'relative', 'image_provenance', 'user_confirmed'].includes(provenance.resolutionKind)
  ) {
    return { valid: false, reason: 'missing_temporal_provenance' }
  }
  const startDate = proposedLocalDate(proposed?.start, options.utcOffset)
  const endDate = proposedLocalDate(proposed?.end, options.utcOffset)
  if (
    !startDate ||
    !endDate ||
    startDate < provenance.rangeStart ||
    startDate > provenance.rangeEnd ||
    endDate < provenance.rangeStart ||
    endDate > dateAfter(provenance.rangeEnd, 1)
  ) {
    return { valid: false, reason: 'proposed_range_mismatch' }
  }
  return { valid: true, reason: null }
}
