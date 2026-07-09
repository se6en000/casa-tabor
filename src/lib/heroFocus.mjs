// Pure helpers for the Home hero card. Kept framework-free so they can be unit
// tested (see tests/hero-focus.test.mjs) and shared with HomePage.tsx.

/**
 * Human-friendly duration for the hero's coverage framing.
 *   210 -> "3.5 hrs", 60 -> "1 hr", 45 -> "45 min", 130 -> "2h 10m", 0 -> "0 min"
 * @param {number} minutes
 * @returns {string}
 */
export function formatDurationLabel(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0))
  if (mins === 0) return '0 min'
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours === 0) return `${rem} min`
  if (rem === 0) return `${hours} hr${hours === 1 ? '' : 's'}`
  if (rem === 30) return `${hours}.5 hrs`
  return `${hours}h ${rem}m`
}

/**
 * The carousel's "live resting index": where the hero snaps back to after the
 * user swipes away and goes idle. Priority: the event happening right now
 * (activeId) → the next upcoming event (nextTodayId) → the first slide. Kept
 * pure so the snap-back target stays correct as time advances.
 * @param {Array<{id?:string}>} slideEvents ordered slide events
 * @param {string|null|undefined} activeId id of the in-progress event, if any
 * @param {string|null|undefined} nextTodayId id of the next upcoming event, if any
 * @returns {number} 0-based index (0 when nothing matches / list empty)
 */
export function resolveRestingIndex(slideEvents, activeId, nextTodayId) {
  if (!Array.isArray(slideEvents) || slideEvents.length === 0) return 0
  if (activeId) {
    const i = slideEvents.findIndex((e) => e && e.id === activeId)
    if (i >= 0) return i
  }
  if (nextTodayId) {
    const i = slideEvents.findIndex((e) => e && e.id === nextTodayId)
    if (i >= 0) return i
  }
  return 0
}

function startMs(event) {
  return new Date(event.start_time).getTime()
}

function endMs(event) {
  const end = event.end_time ? new Date(event.end_time).getTime() : NaN
  if (Number.isNaN(end)) return startMs(event)
  return end
}

/**
 * Pick the event that is happening *right now* and should take over the hero as
 * a live "in progress" state. Excludes all-day events and reminders so they
 * don't hijack the hero. When multiple overlap, the one ending soonest wins
 * (most immediately relevant — it's the window about to free you up).
 * @param {Array<{start_time:string,end_time?:string,all_day?:boolean,event_type?:string}>} events
 * @param {Date|number} now
 * @returns {object|null}
 */
export function pickActiveHeroEvent(events, now) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  if (!Array.isArray(events)) return null
  return (
    events
      .filter(
        (e) =>
          e &&
          e.event_type !== 'reminder' &&
          !e.all_day &&
          startMs(e) <= nowMs &&
          endMs(e) > nowMs,
      )
      .sort((a, b) => endMs(a) - endMs(b))[0] ?? null
  )
}
