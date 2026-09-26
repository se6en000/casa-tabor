// Times in the assistant's prompt, in the family's own clock. The model reads unlabeled
// times however it likes; given "now" as a UTC timestamp it once decided every time was
// UTC and "converted" 9 AM yoga to 4 AM (2026-09-25). So "now" is said in local words
// with its offset, and event times are formatted locally.

const DEFAULT_OFFSET = '-04:00'

function offsetMs(utcOffset) {
  const match = String(utcOffset ?? DEFAULT_OFFSET).match(/([+-])(\d{2}):(\d{2})/)
  if (!match) return null
  const sign = match[1] === '+' ? 1 : -1
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10)) * 60000
}

/** "Sat, Sep 26, 9:00 AM": an ISO time in local time. */
export function formatLocal(iso, utcOffset = DEFAULT_OFFSET) {
  if (!iso) return ''
  const shift = offsetMs(utcOffset)
  if (shift == null) return String(iso)
  const local = new Date(new Date(iso).getTime() + shift)
  return local.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  })
}

/** "Friday, September 25, 2026, 8:48 PM (local time, UTC-04:00)": now, as the family would say it. */
export function localNowLine(iso, utcOffset = DEFAULT_OFFSET) {
  // Only a machine timestamp needs converting; a caller that already sent local words keeps them.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(iso)) || Number.isNaN(new Date(iso).getTime())) return String(iso)
  const shift = offsetMs(utcOffset) ?? 0
  const local = new Date(new Date(iso).getTime() + shift)
  const text = local.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  })
  const offset = String(utcOffset ?? DEFAULT_OFFSET).match(/[+-]\d{2}:\d{2}$/)?.[0] ?? DEFAULT_OFFSET
  return `${text.replace(' at ', ', ')} (local time, UTC${offset})`
}

// A timestamp that says its zone (Z or ±hh:mm); bare dates and zoneless times are left as they are.
const ZONED_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})(?![\d:])/g

/**
 * Evidence documents state event times in UTC ("Starts: 2026-09-26T12:00:00+00:00"); left
 * alone, the model does the zone math and gets the day or hour wrong. Rewrites each into
 * local words ("Sat, Sep 26, 8:00 AM (local)") before the text reaches the prompt.
 */
export function localizeTimestamps(text, utcOffset = DEFAULT_OFFSET) {
  return String(text ?? '').replace(ZONED_TIMESTAMP, (iso) => `${formatLocal(iso, utcOffset)} (local)`)
}

function clockParts(date) {
  const h = date.getUTCHours()
  const m = date.getUTCMinutes()
  return { text: `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''}`, meridiem: h < 12 ? 'AM' : 'PM' }
}

/**
 * "Sun, Sep 27 · 12 – 1 PM": when, for a confirmation card (Jake, 2026-09-26: the card
 * said "2026-09-27T12:00:00-04:00"). Anything that isn't a date comes back as it was.
 */
export function humanWhen(start, end, utcOffset = DEFAULT_OFFSET, options = {}) {
  const dayWords = (date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (options.allDay) {
    const day = new Date(`${String(start).slice(0, 10)}T12:00:00Z`)
    return Number.isNaN(day.getTime()) ? String(start) : `${dayWords(day)} · all day`
  }
  const shift = offsetMs(utcOffset) ?? 0
  const s = new Date(start)
  if (!start || Number.isNaN(s.getTime())) return String(start ?? '')
  const ls = new Date(s.getTime() + shift)
  const a = clockParts(ls)
  const e = end ? new Date(end) : null
  if (!e || Number.isNaN(e.getTime()) || e.getTime() <= s.getTime()) return `${dayWords(ls)} · ${a.text} ${a.meridiem}`
  const b = clockParts(new Date(e.getTime() + shift))
  return `${dayWords(ls)} · ${a.text}${a.meridiem === b.meridiem ? '' : ` ${a.meridiem}`} – ${b.text} ${b.meridiem}`
}
