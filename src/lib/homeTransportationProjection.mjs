function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function driverKey(leg) {
  const id = clean(leg?.driverId)
  const name = clean(leg?.driverName)
  return id || name.toLowerCase()
}

function driverFromLeg(leg) {
  const name = clean(leg?.driverName)
  if (!name) return null
  return {
    id: clean(leg?.driverId) || `external:${name.toLowerCase()}`,
    name,
  }
}

export function transportationLegTimeIso(event, leg) {
  const time = clean(leg?.time)
  if (!/^\d{2}:\d{2}$/.test(time)) return null
  const anchorValue = leg?.timing === 'depart_at' ? event?.end_time : event?.start_time
  const anchor = new Date(anchorValue)
  if (Number.isNaN(anchor.getTime())) return null
  const [hours, minutes] = time.split(':').map(Number)
  anchor.setHours(hours, minutes, 0, 0)
  return anchor.toISOString()
}

function roleForSingleLeg(leg) {
  if (leg?.purpose === 'dropoff') return 'drops off'
  if (leg?.purpose === 'pickup' || leg?.purpose === 'return') return 'picks up'
  return 'drives'
}

export function projectHomeTransportation(event, plan, now = new Date()) {
  if (!plan || !Array.isArray(plan.legs) || plan.legs.length === 0) return null

  const timedLegs = plan.legs
    .map((leg, index) => ({
      leg,
      index,
      timingIso: transportationLegTimeIso(event, leg),
    }))
    .sort((left, right) => {
      if (!left.timingIso) return 1
      if (!right.timingIso) return -1
      return new Date(left.timingIso).getTime() - new Date(right.timingIso).getTime()
    })
  const next = timedLegs.find((item) => (
    item.timingIso && new Date(item.timingIso).getTime() >= now.getTime()
  )) ?? null

  const distinctDrivers = []
  const seen = new Set()
  for (const { leg } of timedLegs) {
    const key = driverKey(leg)
    const driver = driverFromLeg(leg)
    if (!key || !driver || seen.has(key)) continue
    seen.add(key)
    distinctDrivers.push(driver)
  }

  const nextDriver = next ? driverFromLeg(next.leg) : null
  const nextNeedsDriver = Boolean(next && !nextDriver)
  const displayDrivers = nextNeedsDriver
    ? []
    : nextDriver
      ? [
          nextDriver,
          ...distinctDrivers.filter((driver) => driver.id !== nextDriver.id),
        ]
      : distinctDrivers
  const firstDriver = driverFromLeg(timedLegs[0]?.leg)
  const lastDriver = driverFromLeg(timedLegs.at(-1)?.leg)
  let summary
  if (nextNeedsDriver || distinctDrivers.length === 0) {
    summary = 'Driver needed'
  } else if (distinctDrivers.length >= 3) {
    summary = `${distinctDrivers.length} drivers · View plan`
  } else if (
    distinctDrivers.length === 2 &&
    firstDriver &&
    lastDriver &&
    firstDriver.id !== lastDriver.id
  ) {
    summary = `${firstDriver.name} drops off · ${lastDriver.name} picks up`
  } else if (distinctDrivers.length === 2) {
    summary = '2 drivers · View plan'
  } else {
    const driver = distinctDrivers[0]
    summary = plan.waitOnSite
      ? `${driver.name} drives & stays`
      : `${driver.name} ${plan.legs.length === 1 ? roleForSingleLeg(plan.legs[0]) : 'drives'}`
  }

  return {
    drivers: displayDrivers,
    nextDriver,
    summary,
    nextLeg: next
      ? {
          ...next,
          origin: clean(next.leg?.origin?.address) || clean(next.leg?.origin?.name),
          destination: clean(next.leg?.destination?.address) || clean(next.leg?.destination?.name),
        }
      : null,
    hasUnassignedLeg: plan.legs.some((leg) => !driverFromLeg(leg)),
  }
}
