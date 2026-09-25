// Deterministic checks for AI-written times on an event. The model writes full
// ISO timestamps and often gets the date wrong (commonly the year) while the
// clock time is right; nothing it writes is trusted until it fits the event.

const MINUTE = 60_000
const MAX_DEPARTURE_LEAD_MIN = 6 * 60
const MAX_STEP_DISTANCE_MIN = 12 * 60

const toMs = (value) => (typeof value === 'string' || value instanceof Date ? Date.parse(String(value instanceof Date ? value.toISOString() : value)) : NaN)

/**
 * A departure time that is at most 6 hours before the event start and early
 * enough to arrive on time; otherwise start minus the drive time; otherwise null.
 * @param {unknown} value AI-written departure time
 * @param {string} startIso event start
 * @param {number | null | undefined} driveMinutes
 * @returns {string | null}
 */
export function plausibleDepartureIso(value, startIso, driveMinutes) {
  const start = toMs(startIso)
  if (!Number.isFinite(start)) return null
  const hasDrive = typeof driveMinutes === 'number' && driveMinutes > 0
  const latestOnTime = hasDrive ? start - driveMinutes * MINUTE : start
  const t = toMs(value)
  if (Number.isFinite(t)) {
    const lead = (start - t) / MINUTE
    // Keep it only if it fits the hours before the start and doesn't arrive late.
    if (lead >= 0 && lead <= MAX_DEPARTURE_LEAD_MIN && t <= latestOnTime) return new Date(t).toISOString()
  }
  if (hasDrive) return new Date(latestOnTime).toISOString()
  return null
}

/**
 * A logistics step time that sits within 12 hours of the event. A wrong-date
 * time is moved onto the event's date (same UTC clock time) if that fits;
 * otherwise null.
 * @param {unknown} value AI-written step time
 * @param {string} startIso event start
 * @param {string} endIso event end
 * @returns {string | null}
 */
export function sanitizeStepTimeIso(value, startIso, endIso) {
  const start = toMs(startIso)
  const end = Number.isFinite(toMs(endIso)) ? toMs(endIso) : start
  const t = toMs(value)
  if (!Number.isFinite(start) || !Number.isFinite(t)) return null
  const fits = (ms) => ms >= start - MAX_STEP_DISTANCE_MIN * MINUTE && ms <= end + MAX_STEP_DISTANCE_MIN * MINUTE
  if (fits(t)) return new Date(t).toISOString()
  const anchored = new Date(t)
  const day = new Date(start)
  anchored.setUTCFullYear(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  for (const shiftDays of [0, -1, 1]) {
    const candidate = anchored.getTime() + shiftDays * 24 * 60 * MINUTE
    if (fits(candidate)) return new Date(candidate).toISOString()
  }
  return null
}
