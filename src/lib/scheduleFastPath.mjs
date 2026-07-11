// Deterministic, zero-latency answers for the most common read-only schedule
// questions. Answers straight from local event state (rolling today→+14d window),
// skipping the LLM round-trip. Returns null when the query isn't an unambiguous
// match so the normal LLM path runs.
//
// Pure module (no React / no types) so it is unit-testable via `node --test`.

// Words that imply an action/mutation — never fast-path these; let the LLM handle.
export const FASTPATH_BLOCK_VERBS = /\b(add|create|schedule|move|reschedule|delete|remove|cancel|remind|set|change|update|book|invite|clear|buy|plan|make)\b/i
export const FASTPATH_NEXT_TODAY = /\b(what'?s|what is)\s+(the\s+)?next(\s+(thing|event))?\s+today\b/i
export const FASTPATH_NEXT = /\b(what'?s|what is)\s+(coming\s+up\s+)?next(\s+on\s+(the\s+|my\s+)?(calendar|schedule))?\b|\bwhat'?s\s+up\s+next\b|^\s*next\s+(event|thing|up)\s*\??$/i
export const FASTPATH_TODAY = /\b(today'?s\s+(schedule|events|agenda)|what'?s\s+(on|happening|up)\s+today|what\s+do\s+(i|we)\s+have\s+(going\s+on\s+)?today|what'?s\s+(on\s+)?(my\s+)?(calendar|schedule)\s+today|anything\s+(on\s+|going\s+on\s+)?today)\b/i
export const FASTPATH_TOMORROW = /\b(tomorrow'?s\s+(schedule|events|agenda)|what('?s|\s+is)?\s+(on|happening|going\s+on)\s+tomorrow|what\s+do\s+(i|we)\s+have\s+(going\s+on\s+)?tomorrow|what'?s\s+(on\s+)?(the\s+|my\s+)?(calendar|schedule)\s+(for\s+)?tomorrow|anything\s+(on\s+|going\s+on\s+)?tomorrow)\b/i

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatEventLine(e) {
  const when = e.all_day ? 'All day' : fmtTime(e.start_time)
  const loc = e.location_name ? ` · 📍${e.location_name}` : ''
  return `• ${when} — ${e.title}${loc}`
}

export function tryLocalScheduleAnswer(text, events, now = new Date()) {
  const t = (text ?? '').trim()
  if (!t || t.split(/\s+/).length > 16) return null
  if (FASTPATH_BLOCK_VERBS.test(t)) return null
  if (/\b(and|also|but)\b/i.test(t)) return null

  const nowMs = now.getTime()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const todayStart = startOfDay(now)
  const tomorrowStart = todayStart + 24 * 3600_000
  const dayAfterStart = tomorrowStart + 24 * 3600_000

  const parsed = (events ?? [])
    .filter((e) => e && e.start_time)
    .map((e) => ({ e, start: new Date(e.start_time).getTime(), end: new Date(e.end_time ?? e.start_time).getTime() }))
    .filter((x) => Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start)

  if (FASTPATH_NEXT_TODAY.test(t)) {
    const inProgress = parsed.find((x) => !x.e.all_day && x.start <= nowMs && x.end > nowMs)
    const upcoming = parsed.find((x) => x.start > nowMs && x.start < tomorrowStart)
    if (!inProgress && !upcoming) return 'Nothing else on your calendar today.'
    const next = inProgress ?? upcoming
    const prefix = inProgress ? 'Happening now' : 'Up next today'
    const when = inProgress
      ? ` until ${fmtTime(next.e.end_time)}`
      : next.e.all_day ? '' : ` at ${fmtTime(next.e.start_time)}`
    const loc = next.e.location_name ? ` · 📍${next.e.location_name}` : ''
    return `${prefix}: ${next.e.title}${when}${loc}.`
  }

  if (FASTPATH_NEXT.test(t)) {
    const inProgress = parsed.find((x) => !x.e.all_day && x.start <= nowMs && x.end > nowMs)
    const upcoming = parsed.find((x) => x.start > nowMs)
    if (!inProgress && !upcoming) return 'Nothing else on your calendar coming up in the next couple of weeks.'
    const parts = []
    if (inProgress) parts.push(`Happening now: ${inProgress.e.title}${inProgress.e.all_day ? '' : ` until ${fmtTime(inProgress.e.end_time)}`}.`)
    if (upcoming) {
      const mins = Math.round((upcoming.start - nowMs) / 60_000)
      const rel = upcoming.e.all_day ? '' : mins < 60 ? ` (in ${mins} min)` : mins < 24 * 60 ? ` (at ${fmtTime(upcoming.e.start_time)})` : ''
      const loc = upcoming.e.location_name ? ` · 📍${upcoming.e.location_name}` : ''
      parts.push(`Up next: ${upcoming.e.title}${rel}${loc}.`)
    }
    return parts.join(' ')
  }

  const dayQuery = FASTPATH_TODAY.test(t) ? 'today' : FASTPATH_TOMORROW.test(t) ? 'tomorrow' : null
  if (dayQuery) {
    const [lo, hi] = dayQuery === 'today' ? [todayStart, tomorrowStart] : [tomorrowStart, dayAfterStart]
    let dayEvents = parsed.filter((x) => x.start >= lo && x.start < hi)
    if (dayQuery === 'today') dayEvents = dayEvents.filter((x) => x.e.all_day || x.end > nowMs)
    if (dayEvents.length === 0) {
      return dayQuery === 'today' ? 'Nothing left on your calendar today.' : 'Nothing on your calendar for tomorrow.'
    }
    const header = dayQuery === 'today'
      ? (dayEvents.length === 1 ? 'One thing left today:' : `${dayEvents.length} things left today:`)
      : (dayEvents.length === 1 ? 'One thing tomorrow:' : `${dayEvents.length} things tomorrow:`)
    return `${header}\n${dayEvents.map((x) => formatEventLine(x.e)).join('\n')}`
  }

  return null
}
