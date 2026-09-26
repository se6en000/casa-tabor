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
  const shift = offsetMs(utcOffset) ?? 0
  const local = new Date(new Date(iso).getTime() + shift)
  const text = local.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  })
  return `${text.replace(' at ', ', ')} (local time, UTC${utcOffset ?? DEFAULT_OFFSET})`
}
