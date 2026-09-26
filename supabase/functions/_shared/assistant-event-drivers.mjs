// Who drives, as the assistant is told it (2026-09-26: "who's taking Liv to …?" got "I don't
// have any information" because the events it saw never said). Drivers live on the trip
// plan (event_plan_overrides.transportation_plan.legs[].driverId), not on the event.

/** "Kelly drives", "drop-off Jake · pick-up Kelly", "no driver set yet", or '' when there's no trip. */
export function driversLine(planOverride, family) {
  const plan = Array.isArray(planOverride) ? planOverride[0] : planOverride
  const legs = plan?.transportation_plan?.legs
  if (!Array.isArray(legs) || legs.length === 0) return ''
  const nameOf = (leg) => (family ?? []).find((m) => m.id === leg?.driverId)?.name ?? (leg?.driverId ? leg?.driverName || null : null)
  const names = legs.map(nameOf)
  if (names.every((n) => !n)) return 'no driver set yet'
  if (legs.length === 1 || names.every((n) => n === names[0])) return `${names[0]} drives`
  const label = (leg, i) => (leg?.purpose === 'return' ? 'pick-up' : i === 0 ? 'drop-off' : leg?.purpose || `leg ${i + 1}`)
  return legs.map((leg, i) => `${label(leg, i)} ${names[i] ?? 'nobody yet'}`).join(' · ')
}
